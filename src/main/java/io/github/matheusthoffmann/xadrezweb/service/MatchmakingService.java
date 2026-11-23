package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.match.MatchStatus;
import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.repository.MatchRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class MatchmakingService {

    /**
     * O front consulta /matches/find a cada 2 segundos enquanto procura. Quem fica este tempo
     * sem consultar (aba fechada, queda de conexão) é tirado da fila, para não ser pareado
     * com um adversário que não está mais lá.
     */
    static final Duration QUEUE_TTL = Duration.ofSeconds(20);

    // Fila em ordem de chegada: id do usuário -> entrada (usuário e última consulta).
    private final Map<Long, QueueEntry> queue = new LinkedHashMap<>();
    // Partidas recém-criadas aguardando o adversário que estava na fila consultar novamente.
    private final Map<Long, Long> readyMatchByUserId = new HashMap<>();

    private final MatchRepository matchRepository;
    private final GameManager gameManager;

    private static final class QueueEntry {
        final User user;
        Instant lastSeen;

        QueueEntry(User user, Instant lastSeen) {
            this.user = user;
            this.lastSeen = lastSeen;
        }
    }

    public MatchmakingService(MatchRepository matchRepository,
                              GameManager gameManager) {
        this.matchRepository = matchRepository;
        this.gameManager = gameManager;
    }

    public synchronized Match findMatch(User user) {
        Long userId = user.getId();
        Instant now = Instant.now();

        List<Match> activeMatches = matchRepository.findByUserAndStatusOrderByIdDesc(
                user,
                MatchStatus.IN_PROGRESS
        );
        if (!activeMatches.isEmpty()) {
            cancel(userId);
            return activeMatches.get(0);
        }

        Long readyMatchId = readyMatchByUserId.remove(userId);
        if (readyMatchId != null) {
            // Só devolve a partida pronta se ela ainda estiver em andamento; uma partida já
            // encerrada faria o front abrir um jogo finalizado ao procurar novamente.
            Match readyMatch = matchRepository.findById(readyMatchId)
                    .filter(m -> m.getStatus() == MatchStatus.IN_PROGRESS)
                    .orElse(null);
            if (readyMatch != null) {
                return readyMatch;
            }
        }

        removeStaleEntries(now);

        QueueEntry ownEntry = queue.get(userId);
        if (ownEntry != null) {
            ownEntry.lastSeen = now;
            return null;
        }

        User opponent = pollOpponent(userId);
        if (opponent == null) {
            queue.put(userId, new QueueEntry(user, now));
            return null;
        }

        boolean userStartsWhite = ThreadLocalRandom.current().nextBoolean();
        Match match = userStartsWhite
                ? new Match(user, opponent)
                : new Match(opponent, user);

        match = matchRepository.save(match);
        gameManager.createGame(match.getId());
        // O usuário atual recebe a partida nesta resposta; só o adversário precisa buscá-la depois.
        readyMatchByUserId.put(opponent.getId(), match.getId());

        return match;
    }

    public synchronized void cancel(Long userId) {
        queue.remove(userId);
        readyMatchByUserId.remove(userId);
    }

    public synchronized void clearAllPending() {
        queue.clear();
        readyMatchByUserId.clear();
    }

    private User pollOpponent(Long userId) {
        Iterator<Map.Entry<Long, QueueEntry>> iterator = queue.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<Long, QueueEntry> entry = iterator.next();
            if (!entry.getKey().equals(userId)) {
                iterator.remove();
                return entry.getValue().user;
            }
        }
        return null;
    }

    private void removeStaleEntries(Instant now) {
        Instant limit = now.minus(QUEUE_TTL);
        queue.values().removeIf(entry -> entry.lastSeen.isBefore(limit));
    }
}

package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessMatch;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GameManager {

    // Acessado por várias requisições ao mesmo tempo (partidas, matchmaking, usuários).
    private final Map<Long, ChessMatch> games = new ConcurrentHashMap<>();

    // Um lock por partida: a IA pensando em uma partida não bloqueia as demais.
    // Os locks não são removidos para que duas threads nunca usem objetos diferentes
    // para a mesma partida; cada um ocupa poucos bytes.
    private final Map<Long, Object> locks = new ConcurrentHashMap<>();

    public Object lockFor(Long matchId) {
        return locks.computeIfAbsent(matchId, id -> new Object());
    }

    public ChessMatch createGame(Long matchId) {
        ChessMatch game = new ChessMatch();
        games.put(matchId, game);
        return game;
    }

    public ChessMatch getGame(Long matchId) {
        return games.get(matchId);
    }

    public ChessMatch resetGame(Long matchId) {
        return createGame(matchId);
    }

    public void removeGame(Long matchId) {
        games.remove(matchId);
    }
}

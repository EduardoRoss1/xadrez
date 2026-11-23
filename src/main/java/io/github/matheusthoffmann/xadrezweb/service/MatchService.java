package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessMatch;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessPiece;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessPosition;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.Color;
import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.match.MatchStatus;
import io.github.matheusthoffmann.xadrezweb.domain.match.ComputerDifficulty;
import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.dto.board.BoardResponse;
import io.github.matheusthoffmann.xadrezweb.dto.board.PossibleMovesResponse;
import io.github.matheusthoffmann.xadrezweb.dto.match.AdminEndMatchesResponse;
import io.github.matheusthoffmann.xadrezweb.dto.match.MatchResponse;
import io.github.matheusthoffmann.xadrezweb.dto.match.MoveRequest;
import io.github.matheusthoffmann.xadrezweb.exception.BusinessException;
import io.github.matheusthoffmann.xadrezweb.exception.ResourceNotFoundException;
import io.github.matheusthoffmann.xadrezweb.repository.MatchRepository;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Concorrência: o estado do tabuleiro fica em memória ({@link ChessMatch} não é thread-safe),
 * então todo acesso a uma partida é feito sob o lock daquela partida ({@link GameManager#lockFor}).
 * Operações que finalizam a partida também leem a linha com lock pessimista, porque o commit
 * da transação acontece depois que o lock em memória é liberado.
 */
@Service
@Transactional
public class MatchService {

    private static final String ADMIN_USERNAME = "demo";
    private static final int DEFAULT_ELO = 1000;
    private static final int ELO_K_FACTOR = 32;

    private final MatchRepository matchRepository;
    private final UserRepository userRepository;
    private final GameManager gameManager;
    private final MatchmakingService matchmakingService;

    public MatchService(MatchRepository matchRepository,
                        UserRepository userRepository,
                        GameManager gameManager,
                        MatchmakingService matchmakingService) {
        this.matchRepository = matchRepository;
        this.userRepository = userRepository;
        this.gameManager = gameManager;
        this.matchmakingService = matchmakingService;
    }

    public MatchResponse create(Long playerWhiteId, Long playerBlackId) {
        if (playerWhiteId == null || playerBlackId == null) {
            throw new BusinessException("Both players are required");
        }
        if (playerWhiteId.equals(playerBlackId)) {
            throw new BusinessException("A player cannot play against themselves");
        }

        User white = userRepository.findById(playerWhiteId)
                .orElseThrow(() -> new ResourceNotFoundException("White player not found"));

        User black = userRepository.findById(playerBlackId)
                .orElseThrow(() -> new ResourceNotFoundException("Black player not found"));

        Match match = matchRepository.save(new Match(white, black));
        gameManager.createGame(match.getId());

        return toResponse(match);
    }

    public MatchResponse createSimulationMatch() {
        Match match = matchRepository.save(Match.createPlayground());
        gameManager.createGame(match.getId());
        return toResponse(match);
    }

    /** Cria uma partida de treino: humano nas brancas e dificuldade salva na partida. */
    public MatchResponse createComputerMatch(Long userId, String difficulty) {
        ComputerDifficulty level;
        try {
            level = ComputerDifficulty.valueOf(difficulty.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException("Escolha uma dificuldade válida: EASY, MEDIUM ou HARD");
        }
        User player = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Match match = matchRepository.save(Match.againstComputer(player, level));
        gameManager.createGame(match.getId());
        return toResponse(match);
    }

    @Transactional(readOnly = true)
    public MatchResponse findById(Long id, Long userId) {
        Match match = findMatch(id);
        requireMatchParticipant(match, userId);
        return toResponse(match);
    }

    public AdminEndMatchesResponse endAllActiveMatches(Long requesterUserId) {
        User requester = userRepository.findById(requesterUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (!ADMIN_USERNAME.equals(requester.getUsername())) {
            throw new BusinessException("Forbidden");
        }

        List<Match> activeMatches = matchRepository.findByStatus(MatchStatus.IN_PROGRESS);
        for (Match match : activeMatches) {
            synchronized (gameManager.lockFor(match.getId())) {
                match.closeWithoutWinner();
                matchRepository.save(match);
                gameManager.removeGame(match.getId());
            }
        }

        matchmakingService.clearAllPending();
        return new AdminEndMatchesResponse(activeMatches.size());
    }

    @Transactional(readOnly = true)
    public MatchResponse findActiveMatchForUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        List<Match> activeMatches = matchRepository.findByUserAndStatusOrderByIdDesc(
                user,
                MatchStatus.IN_PROGRESS
        );

        if (activeMatches.isEmpty()) {
            return null;
        }

        return toResponse(activeMatches.get(0));
    }

    private MatchResponse toResponse(Match match) {
        return MatchResponse.toMatchResponse(match);
    }

    public void makeMove(Long matchId, MoveRequest request) {
        if (request == null) {
            throw new BusinessException("Move is required");
        }

        synchronized (gameManager.lockFor(matchId)) {
            Match match = findMatchForUpdate(matchId);

            if (match.getStatus() == MatchStatus.FINISHED) {
                throw new BusinessException("Match already finished");
            }

            requireMatchParticipant(match, request.userId());
            ChessMatch game = getOrCreateGame(matchId, match.getStatus());

            if (!isSimulationMatch(match)) {
                validatePlayerTurn(match, game, request.userId());
            }

            ChessPosition source = ChessPosition.fromString(request.source());
            ChessPosition target = ChessPosition.fromString(request.target());

            game.performChessMove(source, target, request.promotionType());

            if (match.isComputerMatch()) {
                if (!finishComputerGame(match, game)) {
                    // Responde na mesma requisição, somente se a jogada humana não encerrou a partida.
                    new ComputerPlayer().play(game, match.getComputerDifficulty());
                    finishComputerGame(match, game);
                }
                // Partidas contra a máquina não entram na finalização competitiva que altera o Elo.
                return;
            }

            if (game.isCheckMate()) {
                if (isSimulationMatch(match)) {
                    // O tabuleiro continua em memória para exibir a posição final do mate.
                    match.closeWithoutWinner();
                    matchRepository.save(match);
                } else {
                    // O motor já trocou o turno: quem está na vez é quem sofreu o mate.
                    boolean whiteWasMated = game.getCurrentPlayer() == Color.WHITE;
                    User winner = whiteWasMated ? match.getPlayerBlack() : match.getPlayerWhite();
                    User loser = whiteWasMated ? match.getPlayerWhite() : match.getPlayerBlack();
                    finalizeMatchWithWinner(match, winner, loser);
                }
                return;
            }

            if (game.getDrawReason() != null) {
                if (isSimulationMatch(match)) {
                    match.closeWithoutWinner();
                    matchRepository.save(match);
                } else {
                    finalizeDraw(match);
                }
            }
        }
    }

    public MatchResponse surrender(Long matchId, Long userId) {
        synchronized (gameManager.lockFor(matchId)) {
            Match match = findMatchForUpdate(matchId);

            if (match.getStatus() == MatchStatus.FINISHED) {
                throw new BusinessException("Match already finished");
            }

            if (isSimulationMatch(match)) {
                throw new BusinessException("Cannot surrender simulation match");
            }

            requireMatchParticipant(match, userId);

            if (match.isComputerMatch()) {
                match.finish(null);
                matchRepository.save(match);
                return toResponse(match);
            }

            boolean whiteSurrendered = match.getPlayerWhite().getId().equals(userId);
            User winner = whiteSurrendered ? match.getPlayerBlack() : match.getPlayerWhite();
            User loser = whiteSurrendered ? match.getPlayerWhite() : match.getPlayerBlack();

            finalizeMatchWithWinner(match, winner, loser);
            gameManager.removeGame(matchId);

            return toResponse(match);
        }
    }

    private void finalizeMatchWithWinner(Match match, User winner, User loser) {
        applyElo(winner, loser, 1.0);
        match.finish(winner);
        matchRepository.save(match);
    }

    private void finalizeDraw(Match match) {
        applyElo(match.getPlayerWhite(), match.getPlayerBlack(), 0.5);
        match.closeWithoutWinner();
        matchRepository.save(match);
    }

    /** Atualiza o Elo dos dois jogadores a partir das notas anteriores à partida. */
    private void applyElo(User player, User opponent, double playerScore) {
        int playerElo = safeElo(player.getElo());
        int opponentElo = safeElo(opponent.getElo());

        player.setElo(calculateElo(playerElo, opponentElo, playerScore));
        opponent.setElo(calculateElo(opponentElo, playerElo, 1.0 - playerScore));

        userRepository.save(player);
        userRepository.save(opponent);
    }

    /** Verifica o fim após cada lado jogar. Retorna true quando a partida terminou. */
    private boolean finishComputerGame(Match match, ChessMatch game) {
        if (game.isCheckMate()) {
            // O motor já trocou o turno: se agora é a vez das pretas, o humano deu mate.
            // A máquina não tem cadastro de usuário; sua vitória fica com winner nulo.
            match.finish(game.getCurrentPlayer() == Color.BLACK ? match.getPlayerWhite() : null);
        } else if (game.getDrawReason() != null) {
            // Afogamento ou material insuficiente: empate.
            match.closeWithoutWinner();
        } else {
            return false;
        }
        matchRepository.save(match);
        return true;
    }

    public void resetMatch(Long matchId, Long userId) {
        synchronized (gameManager.lockFor(matchId)) {
            Match match = findMatchForUpdate(matchId);

            requireMatchParticipant(match, userId);

            // Reabrir uma partida competitiva já encerrada permitiria jogá-la de novo e
            // aplicar o Elo mais uma vez. Playground e partidas contra a máquina não valem Elo.
            boolean competitive = !isSimulationMatch(match) && !match.isComputerMatch();
            if (competitive && match.getStatus() == MatchStatus.FINISHED) {
                throw new BusinessException("Match already finished");
            }

            // Reiniciar o tabuleiro também reinicia a medição de tempo desta partida.
            match.reopen();
            matchRepository.save(match);

            gameManager.resetGame(matchId);
        }
    }

    @Transactional(readOnly = true)
    public BoardResponse getBoard(Long matchId, Long userId) {
        Match match = findMatch(matchId);
        requireMatchParticipant(match, userId);

        synchronized (gameManager.lockFor(matchId)) {
            ChessMatch game = getOrCreateGame(matchId, match.getStatus());

            ChessPiece[][] pieces = game.getPieces();
            String[][] board = new String[8][8];
            for (int i = 0; i < 8; i++) {
                for (int j = 0; j < 8; j++) {
                    board[i][j] = pieces[i][j] == null ? null : serializePiece(pieces[i][j]);
                }
            }

            List<ChessPiece> captured = game.getCapturedPieces();
            return new BoardResponse(
                    board,
                    game.getCurrentPlayer().toString(),
                    game.isCheck(),
                    game.isCheckMate(),
                    game.getLastMove(Color.WHITE),
                    game.getLastMove(Color.BLACK),
                    // Peças pretas capturadas pertencem à lista de capturas das brancas, e vice-versa.
                    captured.stream().filter(p -> p.getColor() == Color.BLACK).map(this::serializePiece).toList(),
                    captured.stream().filter(p -> p.getColor() == Color.WHITE).map(this::serializePiece).toList(),
                    game.getDrawReason()
            );
        }
    }

    @Transactional(readOnly = true)
    public PossibleMovesResponse getPossibleMoves(Long matchId, String source, Long userId) {
        Match match = findMatch(matchId);
        requireMatchParticipant(match, userId);
        ChessPosition sourcePosition = ChessPosition.fromString(source);

        synchronized (gameManager.lockFor(matchId)) {
            ChessMatch game = getOrCreateGame(matchId, match.getStatus());

            if (match.isComputerMatch()) {
                validatePlayerTurn(match, game, userId);
            }

            boolean[][] moves = game.possibleMoves(sourcePosition);

            List<String> targets = new ArrayList<>();
            for (int row = 0; row < moves.length; row++) {
                for (int col = 0; col < moves[row].length; col++) {
                    if (moves[row][col]) {
                        char file = (char) ('a' + col);
                        int rank = 8 - row;
                        targets.add("" + file + rank);
                    }
                }
            }

            return new PossibleMovesResponse(source, targets);
        }
    }

    private Match findMatch(Long matchId) {
        return matchRepository.findById(matchId)
                .orElseThrow(() -> new ResourceNotFoundException("Match not found"));
    }

    private Match findMatchForUpdate(Long matchId) {
        return matchRepository.findByIdForUpdate(matchId)
                .orElseThrow(() -> new ResourceNotFoundException("Match not found"));
    }

    private int safeElo(Integer elo) {
        return elo != null ? elo : DEFAULT_ELO;
    }

    private int calculateElo(int rating, int opponentRating, double score) {
        double expected = 1.0 / (1 + Math.pow(10, (opponentRating - rating) / 400.0));
        // Arredonda em vez de truncar: truncar faz o vencedor ganhar menos e o perdedor
        // perder menos do que deveria, distorcendo as notas com o tempo.
        return (int) Math.round(rating + ELO_K_FACTOR * (score - expected));
    }

    private ChessMatch getOrCreateGame(Long matchId, MatchStatus matchStatus) {
        ChessMatch game = gameManager.getGame(matchId);
        if (game != null) {
            return game;
        }

        if (matchStatus == MatchStatus.FINISHED) {
            throw new BusinessException("Finished match state is unavailable");
        }

        // Partida em andamento sem tabuleiro em memória (ex.: servidor reiniciado).
        return gameManager.createGame(matchId);
    }

    private boolean isSimulationMatch(Match match) {
        return match.isSimulation();
    }

    private void validatePlayerTurn(Match match, ChessMatch game, Long userId) {
        boolean isWhitePlayer = match.getPlayerWhite().getId().equals(userId);
        Color expectedColor = isWhitePlayer ? Color.WHITE : Color.BLACK;
        if (game.getCurrentPlayer() != expectedColor) {
            throw new BusinessException("Not your turn");
        }
    }

    private void requireMatchParticipant(Match match, Long userId) {
        if (isSimulationMatch(match)) {
            return;
        }

        if (userId == null) {
            throw new BusinessException("You are not part of this match");
        }

        boolean isWhitePlayer = match.getPlayerWhite() != null && match.getPlayerWhite().getId().equals(userId);
        boolean isBlackPlayer = match.getPlayerBlack() != null && match.getPlayerBlack().getId().equals(userId);
        if (!isWhitePlayer && !isBlackPlayer) {
            throw new BusinessException("You are not part of this match");
        }
    }

    private String serializePiece(ChessPiece piece) {
        String symbol = piece.toString();
        if (piece.getColor() == Color.BLACK) {
            return symbol.toLowerCase(Locale.ROOT);
        }
        return symbol.toUpperCase(Locale.ROOT);
    }
}

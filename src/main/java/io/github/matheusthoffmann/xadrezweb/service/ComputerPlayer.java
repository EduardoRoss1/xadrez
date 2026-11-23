package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.*;
import io.github.matheusthoffmann.xadrezweb.domain.match.ComputerDifficulty;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Adversário computacional executado no próprio servidor, sem serviço externo.
 * Usa IA clássica: minimax na forma negamax, com poda alfa-beta.
 * Não há aprendizado de máquina: as regras de avaliação foram programadas.
 * As posições da busca são cópias; somente play() executa a jogada escolhida na partida.
 */
public class ComputerPlayer {
    // Um lance contém origem, destino e, quando necessário, a peça de promoção.
    public record Move(ChessPosition source, ChessPosition target, String promotion) {}
    private int nodes;
    // Orçamento compartilhado pelas profundidades de uma escolha, nos níveis médio e difícil.
    // Limita o trabalho da busca por posições, sem representar um prazo em segundos.
    private static final int NODE_LIMIT = 6000;
    private static class SearchLimit extends RuntimeException {}

    /** Reaproveita as regras existentes, incluindo a proibição de deixar o próprio rei em xeque. */
    public List<Move> legalMoves(ChessMatch game) {
        List<Move> moves = new ArrayList<>();
        if (game.isCheckMate()) return moves;
        ChessPiece[][] pieces = game.getPieces();
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                ChessPiece piece = pieces[row][col];
                if (piece == null || piece.getColor() != game.getCurrentPlayer()) continue;
                ChessPosition source = position(row, col);
                boolean[][] targets;
                try {
                    targets = game.possibleMoves(source);
                } catch (ChessException e) {
                    continue; // Esta peça não tem movimentos disponíveis.
                }
                for (int r = 0; r < 8; r++) {
                    for (int c = 0; c < 8; c++) {
                        if (!targets[r][c]) continue;
                        if (piece.toString().equals("P") && (r == 0 || r == 7)) {
                            // A busca considera as quatro promoções possíveis, inclusive para cavalo.
                            for (String promotion : List.of("Q", "N", "R", "B"))
                                moves.add(new Move(source, position(r, c), promotion));
                        } else moves.add(new Move(source, position(r, c), null));
                    }
                }
            }
        }
        return moves;
    }

    public Move chooseMove(ChessMatch live, ComputerDifficulty difficulty) {
        // A análise começa em uma cópia para preservar a posição da partida real.
        ChessMatch game = live.copy();
        List<Move> moves = legalMoves(game);
        if (moves.isEmpty()) return null;
        // FÁCIL: sorteia um movimento legal; não tenta escolher o melhor.
        if (difficulty == ComputerDifficulty.EASY)
            return moves.get(ThreadLocalRandom.current().nextInt(moves.size()));
        order(game, moves);
        Move best = moves.getFirst();
        // Cada profundidade representa um meio-lance (movimento de um único lado).
        // MÉDIO: máquina -> jogador. DIFÍCIL: máquina -> jogador -> máquina.
        int maxDepth = difficulty == ComputerDifficulty.MEDIUM ? 2 : 3;
        nodes = 0;
        // Aprofundamento iterativo: conclui a profundidade 1 antes de tentar 2 e depois 3.
        // Se o orçamento acabar, preserva a melhor jogada da última iteração completa.
        for (int depth = 1; depth <= maxDepth; depth++) {
            int score = Integer.MIN_VALUE;
            Move candidate = best;
            try {
                for (Move move : moves) {
                    ChessMatch child = after(game, move);
                    // Na posição filha é a vez do adversário; invertemos o sinal da pontuação.
                    int value = -search(child, depth - 1, -1000000, -scoreSafe(score));
                    if (value > score) { score = value; candidate = move; }
                }
            } catch (SearchLimit e) { break; }
            best = candidate;
        }
        return best;
    }

    // Evita negar Integer.MIN_VALUE, que ultrapassaria o limite de representação de int.
    private int scoreSafe(int score) { return score == Integer.MIN_VALUE ? -1000000 : score; }

    /**
     * Negamax: cada lado maximiza a própria pontuação, assumindo uma boa resposta adversária.
     * Alfa guarda o melhor resultado encontrado; beta delimita quando o ramo pode ser cortado.
     */
    private int search(ChessMatch game, int depth, int alpha, int beta) {
        if (++nodes > NODE_LIMIT) throw new SearchLimit();
        // Quem está na vez e sofreu mate perdeu. O termo depth favorece mates mais rápidos.
        if (game.isCheckMate()) return -100000 - depth;
        List<Move> moves = legalMoves(game);
        if (moves.isEmpty()) return 0; // Sem xeque e sem movimentos: empate por afogamento.
        // Ao atingir a profundidade planejada, estima a força da posição sem aprofundar mais.
        if (depth == 0) return evaluate(game);
        order(game, moves);
        for (Move move : moves) {
            int score = -search(after(game, move), depth - 1, -beta, -alpha);
            alpha = Math.max(alpha, score);
            // Poda alfa-beta: o adversário já dispõe de alternativa que torna este ramo dispensável.
            if (alpha >= beta) break;
        }
        return alpha;
    }

    /** Depois da busca, aplica apenas a jogada escolhida usando a validação normal do xadrez. */
    public void play(ChessMatch game, ComputerDifficulty difficulty) {
        Move move = chooseMove(game, difficulty);
        if (move != null) game.performChessMove(move.source(), move.target(), move.promotion());
    }

    private ChessMatch after(ChessMatch game, Move move) {
        // Cada ramo tem seu próprio tabuleiro, sem interferir nos outros ramos.
        ChessMatch child = game.copy();
        child.performChessMove(move.source(), move.target(), move.promotion());
        return child;
    }

    private void order(ChessMatch game, List<Move> moves) {
        // Analisa capturas valiosas e promoções primeiro, aumentando a chance de podas.
        // Esta ordenação melhora a busca; não é a avaliação final da jogada.
        ChessPiece[][] board = game.getPieces();
        moves.sort(Comparator.comparingInt((Move m) -> {
            ChessPiece target = board[8 - m.target().getRow()][m.target().getColumn() - 'a'];
            return (target == null ? 0 : value(target) * 10) + (m.promotion() == null ? 0 : 9000);
        }).reversed());
    }

    /** Pontuação heurística: valores positivos favorecem o lado que está na vez. */
    private int evaluate(ChessMatch game) {
        int score = 0;
        ChessPiece[][] board = game.getPieces();
        for (int r = 0; r < 8; r++) for (int c = 0; c < 8; c++) {
            ChessPiece piece = board[r][c];
            if (piece == null) continue;
            // Incentiva peças próximas do centro, sem aplicar esse bônus ao rei.
            int centrality = (int) (14 - 2 * (Math.abs(3.5 - r) + Math.abs(3.5 - c)));
            int bonus = piece.toString().equals("K") ? 0 : centrality;
            // Peões ganham um pequeno bônus conforme avançam em direção à promoção.
            if (piece.toString().equals("P")) bonus += 6 * (piece.getColor() == Color.WHITE ? 6 - r : r - 1);
            score += (piece.getColor() == game.getCurrentPlayer() ? 1 : -1) * (value(piece) + bonus);
        }
        return score;
    }

    private int value(ChessPiece piece) {
        // Valores relativos em centésimos de peão: peão=100, rainha=900.
        // O rei recebe um valor alto; a condição de vitória é tratada pelo xeque-mate.
        return switch (piece.toString()) {
            case "P" -> 100; case "N" -> 320; case "B" -> 330;
            case "R" -> 500; case "Q" -> 900; default -> 20000;
        };
    }

    // Converte índices da matriz (0 a 7) para as coordenadas do tabuleiro (a1 a h8).
    private ChessPosition position(int row, int col) { return new ChessPosition((char) ('a' + col), 8 - row); }
}

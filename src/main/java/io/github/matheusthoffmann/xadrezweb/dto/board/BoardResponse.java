package io.github.matheusthoffmann.xadrezweb.dto.board;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessMatch.PlayedMove;
import java.util.List;

public record BoardResponse(
        String[][] board,
        String currentPlayer,
        boolean check,
        boolean checkmate,
        PlayedMove lastWhiteMove,
        PlayedMove lastBlackMove,
        List<String> capturedByWhite,
        List<String> capturedByBlack,
        // STALEMATE ou INSUFFICIENT_MATERIAL quando a posição terminou empatada; null caso contrário.
        String drawReason
) {
    public BoardResponse(String[][] board, String currentPlayer, boolean check, boolean checkmate) {
        this(board, currentPlayer, check, checkmate, null, null, List.of(), List.of(), null);
    }
    public BoardResponse(String[][] board, String currentPlayer, boolean check, boolean checkmate,
                         PlayedMove lastWhiteMove, PlayedMove lastBlackMove) {
        this(board, currentPlayer, check, checkmate, lastWhiteMove, lastBlackMove, List.of(), List.of(), null);
    }

    public boolean draw() {
        return drawReason != null;
    }
}

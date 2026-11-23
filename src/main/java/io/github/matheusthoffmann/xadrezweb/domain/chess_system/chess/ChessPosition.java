package io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.board.Position;

public class ChessPosition {

    private final char column;
    private final int row;

    public ChessPosition (char column, int row) {
        if (column < 'a' || column > 'h' || row < 1 || row > 8) {
            throw new ChessException("Invalid chess position: "+column+" "+row);
        }
        this.column = column;
        this.row = row;
    }

    protected Position toPosition(){
        return new Position(8-row,column-'a');
    }

    public char getColumn() { return column; }
    public int getRow() { return row; }

    protected static ChessPosition fromPosition(Position position){
        return new ChessPosition((char) (position.getColumn() + 'a'), 8 - position.getRow());
    }

    public static ChessPosition fromString (String pos) {
        // Entrada vinda do cliente: rejeita nulo/formato inválido com erro 400 em vez de 500.
        String normalized = pos == null ? "" : pos.trim().toLowerCase();
        if (!normalized.matches("[a-h][1-8]")) {
            throw new ChessException("Invalid chess position: " + pos);
        }
        return new ChessPosition(normalized.charAt(0), normalized.charAt(1) - '0');
    }
}

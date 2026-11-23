package io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.board.Board;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.board.Piece;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.board.Position;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.pieces.*;

import java.util.ArrayList;
import java.util.List;

public class ChessMatch {

    private final Board board;
    private int turn;
    private Color currentPlayer;
    private boolean check;
    private boolean checkMate;
    private ChessPiece enPassantVulnerable;
    private final List<ChessPiece> piecesOnTheBoard;
    private final List<ChessPiece> capturedPieces;
    public record PlayedMove(String source, String target, String piece, String promotion, Color color, String captured) {}
    private PlayedMove lastWhiteMove;
    private PlayedMove lastBlackMove;

    public PlayedMove getLastMove(Color color) {
        return color == Color.WHITE ? lastWhiteMove : lastBlackMove;
    }

    public ChessMatch () {
        this.board = new Board(8,8);
        this.turn = 1;
        this.currentPlayer = Color.WHITE;
        this.piecesOnTheBoard = new ArrayList<>();
        this.capturedPieces = new ArrayList<>();
        initialSetup();
    }

    /**
     * Copia a posição para a busca da máquina, recriando as peças no tabuleiro da cópia.
     * Preserva turno, xeque, contagem de movimentos (direito ao roque) e peão vulnerável
     * a en passant. Compartilhar as peças originais alteraria a partida durante a análise.
     */
    public ChessMatch copy() {
        ChessMatch copy = new ChessMatch();
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) copy.board.removePiece(new Position(row, col));
        }
        copy.piecesOnTheBoard.clear();
        for (ChessPiece piece : piecesOnTheBoard) {
            Color color = piece.getColor();
            ChessPiece cloned = switch (piece.toString()) {
                case "P" -> new Pawn(copy.board, color, copy);
                case "K" -> new King(copy.board, color, copy);
                default -> copy.replacePromotedPiece(piece.toString(), color);
            };
            for (int i = 0; i < piece.getMoveCount(); i++) cloned.increasedMoveCount();
            copy.board.placePiece(cloned, piece.getChessPosition().toPosition());
            if (piece == enPassantVulnerable) copy.enPassantVulnerable = cloned;
        }
        copy.turn = turn;
        copy.currentPlayer = currentPlayer;
        copy.check = check;
        copy.checkMate = checkMate;
        copy.lastWhiteMove = lastWhiteMove;
        copy.lastBlackMove = lastBlackMove;
        return copy;
    }

    private void initialSetup(){
        board.placePiece(new Rook(board, Color.BLACK,this),(new Position(0,0)));
        board.placePiece(new Knight(board, Color.BLACK,this),(new Position(0,1)));
        board.placePiece(new Bishop(board, Color.BLACK,this),(new Position(0,2)));
        board.placePiece(new Queen(board, Color.BLACK,this),(new Position(0,3)));
        board.placePiece(new King(board, Color.BLACK,this),(new Position(0,4)));
        board.placePiece(new Bishop(board, Color.BLACK,this),(new Position(0,5)));
        board.placePiece(new Knight(board, Color.BLACK,this),(new Position(0,6)));
        board.placePiece(new Rook(board, Color.BLACK,this),(new Position(0,7)));

        for (int i = 0; i < 8; i++) {
            board.placePiece(new Pawn(board, Color.BLACK,this),(new Position(1,i)));
        }


        board.placePiece(new Rook(board, Color.WHITE,this),(new Position(7,0)));
        board.placePiece(new Knight(board, Color.WHITE,this),(new Position(7,1)));
        board.placePiece(new Bishop(board, Color.WHITE,this),(new Position(7,2)));
        board.placePiece(new Queen(board, Color.WHITE,this),(new Position(7,3)));
        board.placePiece(new King(board, Color.WHITE,this),(new Position(7,4)));
        board.placePiece(new Bishop(board, Color.WHITE,this),(new Position(7,5)));
        board.placePiece(new Knight(board, Color.WHITE,this),(new Position(7,6)));
        board.placePiece(new Rook(board, Color.WHITE,this),(new Position(7,7)));

        for (int i = 0; i < 8; i++) {
            board.placePiece(new Pawn(board, Color.WHITE,this),(new Position(6,i)));
        }
    }

    public ChessPiece[][] getPieces() {
        ChessPiece[][] pieces = new ChessPiece[board.getRows()][board.getColumns()];
        for (int i = 0; i < board.getRows(); i++) {
            for (int j = 0; j < board.getColumns(); j++) {
                pieces[i][j] = (ChessPiece) board.piece(i, j);
            }
        }
        return pieces;
    }

    public boolean[][] possibleMoves(ChessPosition position){
        Position sourcePosition = position.toPosition();
        validateSourcePosition(sourcePosition);
        Piece piece = board.piece(sourcePosition);
        boolean[][] legalMoves = new boolean[8][8];

        boolean[][] candidates = piece.possibleMoves();
        for (int i = 0; i < legalMoves.length; i++) {
            for (int j = 0; j < legalMoves[i].length; j++) {
                Position targetPosition = new Position(i,j);
                if (candidates[i][j] && castlePathSafe(sourcePosition, targetPosition)) {
                    ChessPiece capturedPiece = makeMove(sourcePosition, targetPosition);
                    if (!testCheck(currentPlayer)) {
                        undoMove(sourcePosition, targetPosition, capturedPiece);
                        legalMoves[i][j] = true;
                    } else {
                        undoMove(sourcePosition, targetPosition, capturedPiece);
                    }
                }
            }
        }
        return legalMoves;
    }

    public void performChessMove(ChessPosition sourcePosition, ChessPosition targetPosition, String promotionType){
        Position source = sourcePosition.toPosition();
        Position target = targetPosition.toPosition();
        validateSourcePosition(source);
        validateTargetPosition(source, target);

        if (!castlePathSafe(source, target)) throw new ChessException("Cannot castle through check");
        int lastRow = (currentPlayer == Color.WHITE) ? 0 : 7;
        ChessPiece promoted = null;
        if (board.piece(source) instanceof Pawn && target.getRow() == lastRow) {
            if (promotionType == null || !promotionType.matches("(?i)[QRBN]")) {
                throw new ChessException("Promotion piece type is required: Q, R, B or N");
            }
        }

        String movingPiece = board.piece(source).toString();
        boolean wasInCheck = testCheck(currentPlayer);

        ChessPiece capturedPiece = makeMove(source, target);

        if (testCheck(currentPlayer)){
            undoMove(source,target,capturedPiece);
            if (wasInCheck){
                throw new ChessException("You must make a move that removes the check");
            }
            else{
                throw new ChessException("You can't put yourself in check");
            }
        }

        if (board.piece(target) instanceof Pawn && target.getRow() == lastRow){
            promoted = replacePromotedPiece(promotionType, currentPlayer);
            piecesOnTheBoard.remove(board.removePiece(target));
            board.placePiece(promoted, target);
        }

        if (board.piece(target) instanceof Pawn && Math.abs(source.getRow() - target.getRow()) == 2) {
            enPassantVulnerable = (ChessPiece) board.piece(target);
        } else {
            enPassantVulnerable = null;
        }

        check = testCheck(opponent(currentPlayer));
        checkMate = check && testCheckmate(opponent(currentPlayer));

        // Registra somente lances concluídos. Guardar por cor preserva o lance adversário
        // mesmo depois de o jogador responder; simulações da IA usam tabuleiros copiados.
        PlayedMove played = new PlayedMove(
                "" + sourcePosition.getColumn() + sourcePosition.getRow(),
                "" + targetPosition.getColumn() + targetPosition.getRow(),
                movingPiece, promoted != null ? promoted.toString() : null, currentPlayer,
                // Peça capturada (inclusive en passant), usada na narração em áudio do lance.
                capturedPiece != null ? capturedPiece.toString() : null);
        if (currentPlayer == Color.WHITE) lastWhiteMove = played;
        else lastBlackMove = played;

        nextTurn();

    }

    private ChessPiece makeMove(Position sourcePosition, Position targetPosition){
        Piece piece = board.removePiece(sourcePosition);

        //Castling
        if (piece instanceof King && ((King) piece).getMoveCount() == 0){
            int row = sourcePosition.getRow();
            // Kingside
            if (targetPosition.equals(new Position(row,6))){
                Piece rook = board.removePiece(new Position(row, 7));
                board.placePiece(rook, new Position(row, 5));
                ((ChessPiece) rook).increasedMoveCount();
            }
            //Queenside
            else if (targetPosition.equals(new Position(row,2))) {
                Piece rook = board.removePiece(new Position(row, 0));
                board.placePiece(rook, new Position(row, 3));
                ((ChessPiece) rook).increasedMoveCount();
            }
        }

        ChessPiece capturedPiece = (ChessPiece) board.removePiece(targetPosition);

        //En Passant
        if (piece instanceof Pawn && sourcePosition.getColumn() != targetPosition.getColumn() && capturedPiece == null) {
            int direction = (((ChessPiece) piece).getColor() == Color.WHITE) ? 1 : -1;
            capturedPiece = (ChessPiece) board.removePiece(new Position(targetPosition.getRow()+direction, targetPosition.getColumn()));
        }

        if (capturedPiece != null){
            piecesOnTheBoard.remove(capturedPiece);
            capturedPieces.add(capturedPiece);
        }
        board.placePiece(piece,targetPosition);
        ((ChessPiece) piece).increasedMoveCount();
        return capturedPiece;
    }

    private void undoMove(Position sourcePosition, Position targetPosition, ChessPiece capturedPiece){
        Piece piece = board.removePiece(targetPosition);

        //Castling
        if (piece instanceof King && ((King) piece).getMoveCount() == 1){
            int row = sourcePosition.getRow();
            // Kingside
            if (targetPosition.equals(new Position(row,6))){
                Piece rook = board.removePiece(new Position(row, 5));
                board.placePiece(rook, new Position(sourcePosition.getRow(), 7));
                ((ChessPiece) rook).decreasedMoveCount();
            }
            //Queenside
            else if (targetPosition.equals(new Position(row,2))) {
                Piece rook = board.removePiece(new Position(row, 3));
                board.placePiece(rook, new Position(row, 0));
                ((ChessPiece) rook).decreasedMoveCount();
            }
        }

        board.placePiece(piece,sourcePosition);

        //En Passant
        if (piece instanceof Pawn && capturedPiece != null && capturedPiece.equals(enPassantVulnerable) && !capturedPiece.getChessPosition().toPosition().equals(targetPosition)){
            int direction = (((ChessPiece) piece).getColor() == Color.WHITE) ? 1 : -1;
            board.placePiece(capturedPiece, new Position(targetPosition.getRow()+direction, targetPosition.getColumn()));
        }
        else{
            board.placePiece(capturedPiece,targetPosition);
        }

        if (capturedPiece != null) {
            capturedPieces.remove(capturedPiece);
            piecesOnTheBoard.add(capturedPiece);
        }

        ((ChessPiece) piece).decreasedMoveCount();
    }

    private void validateSourcePosition(Position sourcePosition){
        ChessPiece piece = (ChessPiece) board.piece(sourcePosition);
        if (!board.thereIsAPiece(sourcePosition)){
            throw new ChessException("There is no piece on source position");
        }
        if (piece.getColor() != currentPlayer){
            throw new ChessException("This is not a "+currentPlayer+" piece");
        }
        if (!board.piece(sourcePosition).isThereAnyPossibleMove()) {
            throw new ChessException("There is no possible move for this piece");
        }
    }

    private void validateTargetPosition(Position sourcePosition, Position targetPosition){
        if (!board.piece(sourcePosition).possibleMove(targetPosition)){
            throw new ChessException("The chosen piece can't move into this position");
        }
        if (board.thereIsAPiece(targetPosition)){
            ChessPiece piece = (ChessPiece) board.piece(targetPosition);
            if (piece.getColor() == currentPlayer){
                throw new ChessException("There is already a "+currentPlayer+" piece in this position");
            }
        }
    }

    private void nextTurn(){
        turn++;
        if (currentPlayer == Color.WHITE){
            currentPlayer = Color.BLACK;
        }
        else{
            currentPlayer = Color.WHITE;
        }
    }

    private Color opponent(Color color){
        if (color == Color.BLACK){
            return Color.WHITE;
        }
        else{
            return Color.BLACK;
        }
    }

    private ChessPiece king(Color color){
        for (ChessPiece piece : piecesOnTheBoard){
            if (piece instanceof King && piece.getColor() == color){
                return piece;
            }
        }
        throw new IllegalStateException("There is no "+color+" king on the board.");
    }

    private boolean testCheck(Color color){
        Position kingPosition = king(color).getChessPosition().toPosition();
        return isAttacked(kingPosition, opponent(color));
    }

    private boolean castlePathSafe(Position source, Position target) {
        if (!(board.piece(source) instanceof King) || Math.abs(source.getColumn() - target.getColumn()) != 2) return true;
        Color enemy = opponent(((ChessPiece) board.piece(source)).getColor());
        if (isAttacked(source, enemy)) return false;
        Position transit = new Position(source.getRow(), (source.getColumn() + target.getColumn()) / 2);
        ChessPiece captured = makeMove(source, transit);
        boolean safe = !isAttacked(transit, enemy);
        undoMove(source, transit, captured);
        return safe;
    }

    private boolean isAttacked(Position kingPosition, Color attackingColor) {
        List<ChessPiece> opponentPieces = piecesOnTheBoard.stream().filter(x -> x.getColor() == attackingColor).toList();
        for (ChessPiece piece : opponentPieces){
            Position from = piece.getChessPosition().toPosition();
            int dr = kingPosition.getRow() - from.getRow();
            int dc = Math.abs(kingPosition.getColumn() - from.getColumn());
            if (piece instanceof Pawn) {
                if (dr == (attackingColor == Color.WHITE ? -1 : 1) && dc == 1) return true;
                continue;
            }
            if (piece instanceof King) {
                if (Math.abs(dr) <= 1 && dc <= 1) return true;
                continue;
            }
            boolean[][] moves = piece.possibleMoves();
            if (moves[kingPosition.getRow()][kingPosition.getColumn()]){
                return true;
            }
        }
        return false;
    }

    private boolean testCheckmate(Color color){
        List<ChessPiece> alliedPieces = piecesOnTheBoard.stream().filter(x -> x.getColor() == color).toList();
        for (ChessPiece piece : alliedPieces){
            Position sourcePosition = piece.getChessPosition().toPosition();
            boolean[][] moves = piece.possibleMoves();
            for (int i = 0; i < moves.length; i++) {
                for (int j = 0; j < moves[i].length; j++) {
                    if (moves[i][j] && castlePathSafe(sourcePosition, new Position(i,j))) {
                        Position targetPosition = new Position(i,j);
                        ChessPiece capturedPiece = makeMove(sourcePosition, targetPosition);
                        if (!testCheck(color)) {
                            undoMove(sourcePosition, targetPosition, capturedPiece);
                            return false;
                        } else {
                            undoMove(sourcePosition, targetPosition, capturedPiece);
                        }
                    }
                }
            }
        }
        return true;
    }

    public ChessPiece replacePromotedPiece(String type, Color promotedColor){
        String normalizedType = type == null ? "" : type.trim().toUpperCase();
        if (normalizedType.isEmpty()) {
            throw new ChessException("It's not possible to promote to this type of piece");
        }
        char newType = normalizedType.charAt(0);
        return switch (newType) {
            case 'N' -> new Knight(board, promotedColor, this);
            case 'Q' -> new Queen(board, promotedColor, this);
            case 'R' -> new Rook(board, promotedColor, this);
            case 'B' -> new Bishop(board, promotedColor, this);
            default -> throw new ChessException("It's not possible to promote to this type of piece");
        };
    }

    public Board getBoard () {
        return board;
    }

    public int getTurn () {
        return turn;
    }

    public Color getCurrentPlayer () {
        return currentPlayer;
    }

    public boolean isCheck () {
        return check;
    }

    public boolean isCheckMate () {
        return checkMate;
    }

    /** Afogamento: o jogador da vez não está em xeque e não possui nenhum lance legal. */
    public boolean isStalemate() {
        return !checkMate && !check && testCheckmate(currentPlayer);
    }

    /**
     * Material insuficiente para qualquer lado dar mate: rei contra rei,
     * ou rei contra rei com um único bispo ou cavalo.
     */
    public boolean isInsufficientMaterial() {
        int minorPieces = 0;
        for (ChessPiece piece : piecesOnTheBoard) {
            if (piece instanceof King) continue;
            if (piece instanceof Bishop || piece instanceof Knight) {
                minorPieces++;
                continue;
            }
            return false; // Peão, torre ou dama ainda permitem mate.
        }
        return minorPieces <= 1;
    }

    /** Motivo de empate da posição atual, ou null quando a partida continua. */
    public String getDrawReason() {
        if (checkMate) return null;
        if (isInsufficientMaterial()) return "INSUFFICIENT_MATERIAL";
        if (isStalemate()) return "STALEMATE";
        return null;
    }

    public ChessPiece getEnPassantVulnerable () {
        return enPassantVulnerable;
    }

    public void addPieceOnTheBoard(ChessPiece piece){
        piecesOnTheBoard.add(piece);
    }

    public List<ChessPiece> getCapturedPieces () {
        return List.copyOf(capturedPieces);
    }
}

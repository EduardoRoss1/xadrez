package io.github.matheusthoffmann.xadrezweb.domain;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.*;
import io.github.matheusthoffmann.xadrezweb.domain.match.ComputerDifficulty;
import io.github.matheusthoffmann.xadrezweb.service.ComputerPlayer;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class LastMoveTest {
    private void move(ChessMatch game, String from, String to) {
        game.performChessMove(ChessPosition.fromString(from), ChessPosition.fromString(to), null);
    }
    @Test void keepsLastMoveForEachColorAndIgnoresRejectedMoves() {
        ChessMatch game = new ChessMatch();
        assertNull(game.getLastMove(Color.BLACK));
        move(game, "e2", "e4"); move(game, "e7", "e5");
        var black = game.getLastMove(Color.BLACK);
        assertEquals("e7", black.source()); assertEquals("e5", black.target());
        assertEquals("P", black.piece()); assertEquals(Color.BLACK, black.color());
        assertThrows(ChessException.class, () -> move(game, "g1", "g5"));
        assertEquals("e2", game.getLastMove(Color.WHITE).source());
        move(game, "g1", "f3");
        assertSame(black, game.getLastMove(Color.BLACK));
        assertEquals("g1", game.getLastMove(Color.WHITE).source());
        game.possibleMoves(ChessPosition.fromString("b8"));
        assertSame(black, game.getLastMove(Color.BLACK));
    }
    @Test void searchingAndMovingCopiesDoNotOverwriteRealLastMove() {
        ChessMatch game = new ChessMatch(); move(game, "e2", "e4");
        var white = game.getLastMove(Color.WHITE);
        ComputerPlayer computer = new ComputerPlayer();
        computer.chooseMove(game, ComputerDifficulty.MEDIUM);
        assertSame(white, game.getLastMove(Color.WHITE));
        assertNull(game.getLastMove(Color.BLACK));
        computer.play(game, ComputerDifficulty.EASY);
        assertSame(white, game.getLastMove(Color.WHITE));
        assertNotNull(game.getLastMove(Color.BLACK));
        ChessMatch copy = game.copy(); move(copy, "g1", "f3");
        assertSame(white, game.getLastMove(Color.WHITE));
        assertEquals("g1", copy.getLastMove(Color.WHITE).source());
    }
    @Test void promotionPreservesOriginalPieceAndChosenPromotion() {
        ChessMatch game = new ChessMatch();
        move(game, "a2", "a4"); move(game, "h7", "h5");
        move(game, "a4", "a5"); move(game, "h5", "h4");
        move(game, "a5", "a6"); move(game, "h4", "h3");
        move(game, "a6", "b7"); move(game, "h3", "g2");
        game.performChessMove(ChessPosition.fromString("b7"), ChessPosition.fromString("a8"), "N");
        var played = game.getLastMove(Color.WHITE);
        assertEquals("b7", played.source()); assertEquals("a8", played.target());
        assertEquals("P", played.piece()); assertEquals("N", played.promotion());
    }
}

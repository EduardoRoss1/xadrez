package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.*;
import io.github.matheusthoffmann.xadrezweb.domain.match.ComputerDifficulty;
import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.dto.match.MoveRequest;
import io.github.matheusthoffmann.xadrezweb.exception.BusinessException;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:computer-tests;DB_CLOSE_DELAY=-1"})
@Transactional
class ComputerMatchTest {
    @Autowired MatchService service;
    @Autowired UserRepository users;
    @Autowired GameManager games;

    private User player() { return users.save(new User("test-" + UUID.randomUUID(), "test")); }

    @ParameterizedTest
    @EnumSource(ComputerDifficulty.class)
    void computerRepliesAndReturnsTurnToHuman(ComputerDifficulty level) {
        User player = player();
        var match = service.createComputerMatch(player.getId(), level.name());
        assertEquals(level.name(), match.computerDifficulty());
        service.makeMove(match.id(), new MoveRequest(player.getId(), "e2", "e4", null));
        assertEquals(3, games.getGame(match.id()).getTurn());
        assertEquals("WHITE", service.getBoard(match.id(), player.getId()).currentPlayer());
        var board = service.getBoard(match.id(), player.getId());
        assertEquals("e2", board.lastWhiteMove().source());
        assertEquals("e4", board.lastWhiteMove().target());
        assertNotNull(board.lastBlackMove());
        assertNotNull(match.createdAt());
        assertNotNull(match.durationSeconds());
        assertEquals(1000, users.findById(player.getId()).orElseThrow().getElo());
    }

    @Test void rejectsInvalidDifficultyAndOtherPlayers() {
        User player = player();
        assertThrows(BusinessException.class, () -> service.createComputerMatch(player.getId(), "invalid"));
        var match = service.createComputerMatch(player.getId(), "EASY");
        User other = player();
        assertThrows(BusinessException.class, () -> service.getBoard(match.id(), other.getId()));
        assertThrows(ChessException.class, () -> service.makeMove(match.id(),
                new MoveRequest(player.getId(), "e7", "e5", null)));
        assertEquals(1, games.getGame(match.id()).getTurn());
    }

    @Test void surrenderAndResetKeepDifficultyAndRating() {
        User player = player();
        var match = service.createComputerMatch(player.getId(), "HARD");
        var finished = service.surrender(match.id(), player.getId());
        assertEquals("FINISHED", finished.status());
        assertEquals("HARD", finished.computerDifficulty());
        assertNotNull(finished.finishedAt());
        assertNotNull(finished.durationSeconds());
        assertEquals(1000, player.getElo());
        assertThrows(BusinessException.class, () -> service.makeMove(match.id(),
                new MoveRequest(player.getId(), "e2", "e4", null)));
        service.resetMatch(match.id(), player.getId());
        assertEquals("IN_PROGRESS", service.findById(match.id(), player.getId()).status());
        assertEquals(1, games.getGame(match.id()).getTurn());
        assertNull(service.getBoard(match.id(), player.getId()).lastWhiteMove());
        assertNull(service.getBoard(match.id(), player.getId()).lastBlackMove());
        assertNull(service.findById(match.id(), player.getId()).finishedAt());
    }

    @Test void computerCheckmateFinishesWithoutChangingRating() {
        User player = player();
        var match = service.createComputerMatch(player.getId(), "MEDIUM");
        ChessMatch game = games.getGame(match.id());
        move(game, "f2", "f3"); move(game, "e7", "e5");
        service.makeMove(match.id(), new MoveRequest(player.getId(), "g2", "g4", null));
        assertTrue(game.isCheckMate(), "Computer should find Qh4 mate");
        assertEquals("FINISHED", service.findById(match.id(), player.getId()).status());
        assertNull(service.findById(match.id(), player.getId()).winnerId());
        assertEquals(1000, player.getElo());
    }

    @Test void searchPreservesBoardAndEnPassantRights() {
        ChessMatch game = new ChessMatch();
        move(game, "e2", "e4"); move(game, "a7", "a6");
        move(game, "e4", "e5"); move(game, "d7", "d5");
        ChessMatch copy = game.copy();
        assertTrue(copy.possibleMoves(ChessPosition.fromString("e5"))[2][3]);
        new ComputerPlayer().chooseMove(game, ComputerDifficulty.HARD);
        assertEquals(5, game.getTurn());
        assertTrue(game.possibleMoves(ChessPosition.fromString("e5"))[2][3]);
        assertNotSame(game.getPieces()[3][3], copy.getPieces()[3][3]);
    }

    @Test void pawnCannotJump() {
        ChessMatch game = new ChessMatch();
        move(game, "b1", "c3"); move(game, "a7", "a6");
        assertThrows(ChessException.class, () -> game.possibleMoves(ChessPosition.fromString("c2")));
        assertThrows(ChessException.class, () -> move(game, "c2", "c4"));
    }

    @Test void invalidPromotionLeavesPositionIntactAndValidPromotionCanBeCopied() {
        ChessMatch game = new ChessMatch();
        move(game, "a2", "a4"); move(game, "h7", "h5");
        move(game, "a4", "a5"); move(game, "h5", "h4");
        move(game, "a5", "a6"); move(game, "h4", "h3");
        move(game, "a6", "b7"); move(game, "h3", "g2");
        assertThrows(ChessException.class, () -> move(game, "b7", "a8"));
        assertEquals("P", game.getPieces()[1][1].toString());
        assertEquals("R", game.getPieces()[0][0].toString());
        game.performChessMove(ChessPosition.fromString("b7"), ChessPosition.fromString("a8"), "Q");
        ChessMatch copy = game.copy();
        assertEquals("Q", copy.getPieces()[0][0].toString());
        assertEquals(Color.BLACK, copy.getCurrentPlayer());
        assertFalse(new ComputerPlayer().legalMoves(copy).isEmpty());
    }

    @Test void copyingPreservesCastlingAndMovingCopyDoesNotMoveOriginalRook() {
        ChessMatch game = new ChessMatch();
        move(game, "e2", "e4"); move(game, "a7", "a6");
        move(game, "g1", "f3"); move(game, "a6", "a5");
        move(game, "f1", "e2"); move(game, "a5", "a4");
        ChessMatch copy = game.copy();
        move(copy, "e1", "g1");
        assertEquals("K", copy.getPieces()[7][6].toString());
        assertEquals("R", copy.getPieces()[7][5].toString());
        assertEquals("R", game.getPieces()[7][7].toString());
        assertEquals(0, game.getPieces()[7][7].getMoveCount());
    }

    private void move(ChessMatch game, String from, String to) {
        game.performChessMove(ChessPosition.fromString(from), ChessPosition.fromString(to), null);
    }
}

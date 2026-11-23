package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.domain.match.ComputerDifficulty;
import io.github.matheusthoffmann.xadrezweb.dto.match.MoveRequest;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:capture-tests;DB_CLOSE_DELAY=-1")
@Transactional
class CaptureDisplayTest {
    @Autowired MatchService service;
    @Autowired GameManager games;
    @Autowired UserRepository users;

    private record Game(Long id, Long white, Long black) {}
    private Game create() {
        User white = users.save(new User("white-" + UUID.randomUUID(), "test"));
        User black = users.save(new User("black-" + UUID.randomUUID(), "test"));
        return new Game(service.create(white.getId(), black.getId()).id(), white.getId(), black.getId());
    }
    private void move(Game game, boolean white, String from, String to) {
        service.makeMove(game.id(), new MoveRequest(white ? game.white() : game.black(), from, to, null));
    }

    @Test void showsWhoCapturedEachPieceAndResetClearsBothLists() {
        Game game = create();
        move(game, true, "e2", "e4"); move(game, false, "d7", "d5");
        move(game, true, "e4", "d5"); move(game, false, "d8", "d5");
        var board = service.getBoard(game.id(), game.white());
        assertEquals(List.of("p"), board.capturedByWhite());
        assertEquals(List.of("P"), board.capturedByBlack());
        service.getPossibleMoves(game.id(), "b1", game.white());
        new ComputerPlayer().chooseMove(games.getGame(game.id()), ComputerDifficulty.MEDIUM);
        assertEquals(board.capturedByWhite(), service.getBoard(game.id(), game.black()).capturedByWhite());
        assertEquals(board.capturedByBlack(), service.getBoard(game.id(), game.black()).capturedByBlack());
        service.resetMatch(game.id(), game.white());
        var reset = service.getBoard(game.id(), game.white());
        assertTrue(reset.capturedByWhite().isEmpty()); assertTrue(reset.capturedByBlack().isEmpty());
    }

    @Test void enPassantIsCountedEvenWhenDestinationWasEmpty() {
        Game game = create();
        move(game, true, "e2", "e4"); move(game, false, "a7", "a6");
        move(game, true, "e4", "e5"); move(game, false, "d7", "d5");
        service.getPossibleMoves(game.id(), "e5", game.white());
        assertTrue(service.getBoard(game.id(), game.white()).capturedByWhite().isEmpty());
        move(game, true, "e5", "d6");
        var board = service.getBoard(game.id(), game.white());
        assertEquals(List.of("p"), board.capturedByWhite()); assertTrue(board.capturedByBlack().isEmpty());
    }

    @Test void promotionCaptureCountsRookWithoutTreatingPromotedPawnAsCaptured() {
        Game game = create();
        move(game, true, "a2", "a4"); move(game, false, "h7", "h5");
        move(game, true, "a4", "a5"); move(game, false, "h5", "h4");
        move(game, true, "a5", "a6"); move(game, false, "h4", "h3");
        move(game, true, "a6", "b7"); move(game, false, "h3", "g2");
        service.makeMove(game.id(), new MoveRequest(game.white(), "b7", "a8", "Q"));
        var board = service.getBoard(game.id(), game.white());
        assertEquals(List.of("p", "r"), board.capturedByWhite());
        assertEquals(List.of("P"), board.capturedByBlack());
    }
}

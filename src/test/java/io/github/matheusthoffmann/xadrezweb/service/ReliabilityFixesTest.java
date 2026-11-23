package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessException;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessMatch;
import io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.ChessPosition;
import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.dto.match.MoveRequest;
import io.github.matheusthoffmann.xadrezweb.dto.user.UserRequest;
import io.github.matheusthoffmann.xadrezweb.exception.BusinessException;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:reliability-tests;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@Transactional
class ReliabilityFixesTest {
    @Autowired MatchService matches;
    @Autowired MatchmakingService matchmaking;
    @Autowired UserService userService;
    @Autowired UserRepository users;
    @Autowired GameManager games;
    @Autowired MockMvc mvc;

    @BeforeEach
    void clearQueue() {
        matchmaking.clearAllPending();
    }

    private User user() {
        return users.save(new User("u-" + UUID.randomUUID().toString().substring(0, 8), "pass"));
    }

    @Test
    void malformedPositionsAreRejectedAsChessErrors() {
        for (String bad : new String[]{null, "", "e", "z9", "e9", "e0", "e10", "ee"}) {
            assertThrows(ChessException.class, () -> ChessPosition.fromString(bad), "input: " + bad);
        }
        assertEquals('e', ChessPosition.fromString(" E4 ").getColumn());
        assertEquals(4, ChessPosition.fromString("e4").getRow());
    }

    @Test
    void stalemateEndsCompetitiveMatchAsDraw() {
        User white = user();
        User black = user();
        var match = matches.create(white.getId(), black.getId());
        // Afogamento mais curto conhecido (Sam Loyd, 10 lances).
        String[][] moves = {
                {"e2", "e3"}, {"a7", "a5"}, {"d1", "h5"}, {"a8", "a6"}, {"h5", "a5"}, {"h7", "h5"},
                {"h2", "h4"}, {"a6", "h6"}, {"a5", "c7"}, {"f7", "f6"}, {"c7", "d7"}, {"e8", "f7"},
                {"d7", "b7"}, {"d8", "d3"}, {"b7", "b8"}, {"d3", "h7"}, {"b8", "c8"}, {"f7", "g6"},
                {"c8", "e6"}
        };
        for (int i = 0; i < moves.length; i++) {
            Long mover = i % 2 == 0 ? white.getId() : black.getId();
            matches.makeMove(match.id(), new MoveRequest(mover, moves[i][0], moves[i][1], null));
        }

        var board = matches.getBoard(match.id(), white.getId());
        assertFalse(board.checkmate());
        assertEquals("STALEMATE", board.drawReason());

        var finished = matches.findById(match.id(), white.getId());
        assertEquals("FINISHED", finished.status());
        assertNull(finished.winnerId());
        // Mesma nota inicial: empate não altera o Elo.
        assertEquals(1000, users.findById(white.getId()).orElseThrow().getElo());
        assertEquals(1000, users.findById(black.getId()).orElseThrow().getElo());
    }

    @Test
    void lastMoveReportsCapturedPieceForNarration() {
        ChessMatch game = new ChessMatch();
        game.performChessMove(ChessPosition.fromString("e2"), ChessPosition.fromString("e4"), null);
        assertNull(game.getLastMove(io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.Color.WHITE).captured());
        game.performChessMove(ChessPosition.fromString("d7"), ChessPosition.fromString("d5"), null);
        game.performChessMove(ChessPosition.fromString("e4"), ChessPosition.fromString("d5"), null);
        assertEquals("P", game.getLastMove(io.github.matheusthoffmann.xadrezweb.domain.chess_system.chess.Color.WHITE).captured());
    }

    @Test
    void initialPositionIsNotADraw() {
        ChessMatch game = new ChessMatch();
        assertFalse(game.isStalemate());
        assertFalse(game.isInsufficientMaterial());
        assertNull(game.getDrawReason());
    }

    @Test
    void searchingAgainAfterFinishedMatchDoesNotReturnTheOldMatch() {
        User first = user();
        User second = user();
        assertNull(matchmaking.findMatch(first));
        Match created = matchmaking.findMatch(second);
        assertNotNull(created);

        matches.surrender(created.getId(), first.getId());

        // Antes, quem criou a partida recebia de novo a partida já finalizada.
        assertNull(matchmaking.findMatch(second));
        // O outro jogador também não recebe a antiga: é pareado de novo com quem está na fila.
        Match rematch = matchmaking.findMatch(first);
        assertNotNull(rematch);
        assertNotEquals(created.getId(), rematch.getId());
        assertEquals("IN_PROGRESS", rematch.getStatus().name());
    }

    @Test
    void finishedCompetitiveMatchCannotBeReopenedButComputerMatchCan() {
        User white = user();
        User black = user();
        var match = matches.create(white.getId(), black.getId());
        matches.surrender(match.id(), black.getId());
        assertThrows(BusinessException.class, () -> matches.resetMatch(match.id(), black.getId()));
        assertEquals("FINISHED", matches.findById(match.id(), white.getId()).status());
    }

    @Test
    void surrenderTwiceAppliesEloOnce() {
        User white = user();
        User black = user();
        var match = matches.create(white.getId(), black.getId());
        matches.surrender(match.id(), black.getId());
        assertThrows(BusinessException.class, () -> matches.surrender(match.id(), black.getId()));
        assertEquals(1016, users.findById(white.getId()).orElseThrow().getElo());
        assertEquals(984, users.findById(black.getId()).orElseThrow().getElo());
    }

    @Test
    void playerCannotBeMatchedAgainstThemselves() {
        User player = user();
        assertThrows(BusinessException.class, () -> matches.create(player.getId(), player.getId()));
    }

    @Test
    void usersCanOnlyUpdateTheirOwnAccount() {
        User owner = user();
        User other = user();
        UserRequest change = new UserRequest("renamed-" + UUID.randomUUID().toString().substring(0, 6), "newpass");
        assertThrows(BusinessException.class, () -> userService.update(owner.getId(), change, other.getId()));
        assertThrows(BusinessException.class, () -> userService.update(owner.getId(), change, null));
        assertEquals(change.username(), userService.update(owner.getId(), change, owner.getId()).username());
    }

    @Test
    void malformedRequestsReturnBadRequestInsteadOfServerError() throws Exception {
        User player = user();
        var match = matches.create(player.getId(), user().getId());

        mvc.perform(post("/matches/find")).andExpect(status().isBadRequest());
        mvc.perform(post("/matches/find").param("userId", "abc")).andExpect(status().isBadRequest());
        mvc.perform(post("/matches/" + match.id() + "/moves")
                        .contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/matches/" + match.id() + "/moves")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":" + player.getId() + ",\"source\":null,\"target\":\"e4\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/users")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"abc\"}"))
                .andExpect(status().isBadRequest());
    }
}

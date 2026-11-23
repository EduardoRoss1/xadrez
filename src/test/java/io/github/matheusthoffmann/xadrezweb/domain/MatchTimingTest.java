package io.github.matheusthoffmann.xadrezweb.domain;

import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.match.MatchStatus;
import io.github.matheusthoffmann.xadrezweb.dto.match.MatchResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

class MatchTimingTest {
    @Test void finishedDurationIsFixedAndIncludedInHistory() {
        Match match = new Match(null, null);
        LocalDateTime start = LocalDateTime.of(2026, 1, 10, 14, 0);
        ReflectionTestUtils.setField(match, "createdAt", start);
        match.closeWithoutWinner();
        ReflectionTestUtils.setField(match, "finishedAt", start.plusHours(1).plusMinutes(2).plusSeconds(3));
        MatchResponse response = MatchResponse.toMatchResponse(match);
        assertEquals(3723L, response.durationSeconds());
        assertEquals(start, response.createdAt());
        assertEquals(start.plusSeconds(3723), response.finishedAt());
        assertEquals(3723L, match.getDurationSeconds());
    }

    @Test void resetRestartsTimingForActiveAndFinishedGames() {
        for (boolean finished : new boolean[]{false, true}) {
            Match match = new Match(null, null);
            ReflectionTestUtils.setField(match, "createdAt", LocalDateTime.of(2020, 1, 1, 0, 0));
            if (finished) match.closeWithoutWinner();
            LocalDateTime before = LocalDateTime.now();
            match.reopen();
            assertFalse(match.getCreatedAt().isBefore(before));
            assertEquals(MatchStatus.IN_PROGRESS, match.getStatus());
            assertNull(match.getFinishedAt());
        }
    }

    @Test void missingOldTimestampIsUnavailableAndClockSkewIsClamped() {
        assertNull(new Match().getDurationSeconds());
        Match match = new Match(null, null);
        ReflectionTestUtils.setField(match, "createdAt", LocalDateTime.now().plusDays(1));
        assertEquals(0L, match.getDurationSeconds());
    }
}

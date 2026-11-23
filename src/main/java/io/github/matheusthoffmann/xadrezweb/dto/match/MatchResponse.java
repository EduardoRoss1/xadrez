package io.github.matheusthoffmann.xadrezweb.dto.match;

import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import java.time.LocalDateTime;

public record MatchResponse(
        Long id,
        Long playerWhiteId,
        Long playerBlackId,
        String status,
        Long winnerId,
        String computerDifficulty,
        LocalDateTime createdAt,
        LocalDateTime finishedAt,
        Long durationSeconds
) {
    public MatchResponse(Long id, Long white, Long black, String status, Long winner) {
        this(id, white, black, status, winner, null, null, null, null);
    }
    public static MatchResponse toMatchResponse (Match match) {
        return new MatchResponse(
                match.getId(),
                match.getPlayerWhite() != null ? match.getPlayerWhite().getId() : null,
                match.getPlayerBlack() != null ? match.getPlayerBlack().getId() : null,
                match.getStatus().name(),
                match.getWinner() != null ? match.getWinner().getId() : null,
                match.getComputerDifficulty() != null ? match.getComputerDifficulty().name() : null,
                match.getCreatedAt(),
                match.getFinishedAt(),
                match.getDurationSeconds()
        );
    }
}

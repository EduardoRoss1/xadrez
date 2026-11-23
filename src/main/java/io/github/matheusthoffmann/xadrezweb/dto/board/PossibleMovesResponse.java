package io.github.matheusthoffmann.xadrezweb.dto.board;

import java.util.List;

public record PossibleMovesResponse(
        String source,
        List<String> targets
) {
}


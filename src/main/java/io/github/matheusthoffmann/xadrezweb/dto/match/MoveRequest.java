package io.github.matheusthoffmann.xadrezweb.dto.match;

public record MoveRequest(
        Long userId,
        String source,
        String target,
        String promotionType
) {}
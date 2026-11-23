package io.github.matheusthoffmann.xadrezweb.dto.user;

public record UserResponse(
        Long id,
        String username,
        Integer elo,
        boolean active
) {}

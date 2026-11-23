package io.github.matheusthoffmann.xadrezweb.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "Username is required")
        @Size(min = 3, message = "Username must have at least 3 characters")
        String username,

        @NotBlank(message = "Password is required")
        @Size(min = 3, message = "Password must have at least 3 characters")
        String password
) {}

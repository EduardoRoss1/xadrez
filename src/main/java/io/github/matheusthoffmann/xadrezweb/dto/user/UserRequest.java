package io.github.matheusthoffmann.xadrezweb.dto.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Limites máximos iguais aos tamanhos das colunas em User, para não estourar no banco.
public record UserRequest(
        @NotBlank(message = "Username is required")
        @Size(min = 3, message = "Username must have at least 3 characters")
        @Size(max = 64, message = "Username must have at most 64 characters")
        String username,

        @NotBlank(message = "Password is required")
        @Size(min = 3, message = "Password must have at least 3 characters")
        @Size(max = 128, message = "Password must have at most 128 characters")
        String password
) {}

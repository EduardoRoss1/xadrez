package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.dto.auth.LoginRequest;
import io.github.matheusthoffmann.xadrezweb.dto.auth.LoginResponse;
import io.github.matheusthoffmann.xadrezweb.exception.AuthentificationException;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository repository;
    private final UserPresenceService presenceService;

    public AuthService(UserRepository repository, UserPresenceService presenceService) {
        this.repository = repository;
        this.presenceService = presenceService;
    }

    public LoginResponse login(LoginRequest request) {
        User user = repository.findByUsername(request.username())
                .orElseThrow(() -> new AuthentificationException("Invalid username or password"));

        if (!user.getPassword().equals(request.password())) {
            throw new AuthentificationException("Invalid username or password");
        }

        presenceService.markActive(user.getId());

        return new LoginResponse(
                user.getId(),
                user.getUsername(),
                user.getElo()
        );
    }

    public void markActive(Long userId) {
        if (repository.existsById(userId)) {
            presenceService.markActive(userId);
        }
    }

    public void logout(Long userId) {
        presenceService.markInactive(userId);
    }
}

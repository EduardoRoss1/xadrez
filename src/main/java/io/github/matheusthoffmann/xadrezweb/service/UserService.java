package io.github.matheusthoffmann.xadrezweb.service;

import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.dto.match.MatchResponse;
import io.github.matheusthoffmann.xadrezweb.dto.user.UserRequest;
import io.github.matheusthoffmann.xadrezweb.dto.user.UserResponse;
import io.github.matheusthoffmann.xadrezweb.exception.BusinessException;
import io.github.matheusthoffmann.xadrezweb.exception.ResourceNotFoundException;
import io.github.matheusthoffmann.xadrezweb.repository.MatchRepository;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class UserService {

    private static final String ADMIN_USERNAME = "demo";

    private final UserRepository repository;
    private final MatchRepository matchRepository;
    private final UserPresenceService presenceService;
    private final MatchmakingService matchmakingService;
    private final GameManager gameManager;

    public UserService(UserRepository repository,
                       MatchRepository matchRepository,
                       UserPresenceService presenceService,
                       MatchmakingService matchmakingService,
                       GameManager gameManager) {
        this.repository = repository;
        this.matchRepository = matchRepository;
        this.presenceService = presenceService;
        this.matchmakingService = matchmakingService;
        this.gameManager = gameManager;
    }

    public UserResponse create(UserRequest request) {
        repository.findByUsername(request.username())
                .ifPresent(u -> {
                    throw new BusinessException("Username already exists");
                });

        User user = new User(request.username(), request.password());

        repository.save(user);
        presenceService.markActive(user.getId());
        return toResponse(user);
    }

    public UserResponse findById(Long id) {
        User user = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        return toResponse(user);
    }

    public List<UserResponse> findAll() {
        return repository.findAll()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<UserResponse> findActive(Long requesterUserId) {
        User requester = repository.findById(requesterUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (!ADMIN_USERNAME.equals(requester.getUsername())) {
            throw new BusinessException("Forbidden");
        }

        return repository.findAll()
                .stream()
                .filter(user -> !ADMIN_USERNAME.equals(user.getUsername()))
                .filter(user -> presenceService.isActive(user.getId()))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public UserResponse update(Long id, UserRequest request, Long requesterUserId) {
        User user = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Mesmo critério da exclusão: só o próprio usuário (ou o admin) altera a conta.
        requireSelfOrAdmin(id, requesterUserId);

        // A conta admin é identificada pelo nome; renomeá-la perderia o acesso de admin
        // e permitiria que outra pessoa cadastrasse "demo" e virasse admin.
        if (ADMIN_USERNAME.equals(user.getUsername()) && !ADMIN_USERNAME.equals(request.username())) {
            throw new BusinessException("Cannot rename admin account");
        }

        repository.findByUsername(request.username())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new BusinessException("Username already exists");
                });

        user.setUsername(request.username());
        user.setPassword(request.password());

        repository.save(user);
        return toResponse(user);
    }

    @Transactional
    public void delete(Long id, Long requesterUserId) {
        User target = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (ADMIN_USERNAME.equals(target.getUsername())) {
            throw new BusinessException("Cannot delete admin account");
        }

        requireSelfOrAdmin(id, requesterUserId);

        matchmakingService.cancel(id);
        removeUserMatches(target);
        presenceService.markInactive(id);
        repository.deleteById(id);
    }

    private void requireSelfOrAdmin(Long targetUserId, Long requesterUserId) {
        if (requesterUserId == null) {
            throw new BusinessException("Forbidden");
        }

        User requester = repository.findById(requesterUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        boolean isSelf = requester.getId().equals(targetUserId);
        boolean isAdmin = ADMIN_USERNAME.equals(requester.getUsername());

        if (!isSelf && !isAdmin) {
            throw new BusinessException("Forbidden");
        }
    }

    private void removeUserMatches(User user) {
        List<Match> matches = matchRepository.findByPlayerWhiteOrPlayerBlack(user, user);
        for (Match match : matches) {
            gameManager.removeGame(match.getId());
        }
        if (!matches.isEmpty()) {
            matchRepository.deleteAll(matches);
        }
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getElo(),
                presenceService.isActive(user.getId())
        );
    }

    public List<MatchResponse> getUserMatches(Long userId) {

        User user = repository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Mais recentes primeiro; sem ORDER BY a ordem do banco não é garantida.
        List<Match> matches =
                matchRepository.findByPlayerWhiteOrPlayerBlackOrderByIdDesc(user, user);

        return matches.stream()
                .map(MatchResponse::toMatchResponse)
                .toList();
    }
}

package io.github.matheusthoffmann.xadrezweb.service;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserPresenceService {

    private static final Duration ACTIVE_TTL = Duration.ofMinutes(2);

    private final Map<Long, Instant> lastSeenByUserId = new ConcurrentHashMap<>();

    public void markActive(Long userId) {
        if (userId != null) {
            lastSeenByUserId.put(userId, Instant.now());
        }
    }

    public void markInactive(Long userId) {
        if (userId != null) {
            lastSeenByUserId.remove(userId);
        }
    }

    public boolean isActive(Long userId) {
        if (userId == null) {
            return false;
        }

        Instant lastSeen = lastSeenByUserId.get(userId);
        if (lastSeen == null) {
            return false;
        }

        if (isExpired(lastSeen)) {
            lastSeenByUserId.remove(userId);
            return false;
        }

        return true;
    }

    public Set<Long> getActiveUserIds() {
        removeExpiredUsers();
        return Set.copyOf(lastSeenByUserId.keySet());
    }

    private void removeExpiredUsers() {
        lastSeenByUserId.entrySet()
                .removeIf(entry -> isExpired(entry.getValue()));
    }

    private boolean isExpired(Instant lastSeen) {
        return lastSeen.plus(ACTIVE_TTL).isBefore(Instant.now());
    }
}

package io.github.matheusthoffmann.xadrezweb.config;

import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import io.github.matheusthoffmann.xadrezweb.repository.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DatabaseSeeder implements ApplicationRunner {

    private final UserRepository userRepository;

    public DatabaseSeeder(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedUser("demo", "demo");
        seedUser("guest", "guest");
    }

    private void seedUser(String username, String password) {
        if (userRepository.findByUsername(username).isEmpty()) {
            userRepository.save(new User(username, password));
        }
    }
}

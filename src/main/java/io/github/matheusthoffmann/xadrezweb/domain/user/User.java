package io.github.matheusthoffmann.xadrezweb.domain.user;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    @Column(nullable = false, length = 128)
    private String password;

    @Column(nullable = false)
    private Integer elo;

    public User() {}

    public User(String username, String password) {
        this.username = username;
        this.password = password;
        this.elo = 1000;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public Integer getElo() { return elo; }

    public void setUsername(String username) { this.username = username; }
    public void setPassword(String password) { this.password = password; }
    public void setElo(Integer elo){ this.elo = elo; }

}

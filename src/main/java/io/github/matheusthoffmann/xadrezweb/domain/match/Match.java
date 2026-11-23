package io.github.matheusthoffmann.xadrezweb.domain.match;

import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.time.Duration;

@Entity
@Table(name = "matches")
public class Match {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private boolean simulation = false;

    @Enumerated(EnumType.STRING)
    private ComputerDifficulty computerDifficulty;

    @ManyToOne(optional = true)
    private User playerWhite;

    @ManyToOne(optional = true)
    private User playerBlack;

    @Enumerated(EnumType.STRING)
    private MatchStatus status;

    @ManyToOne
    private User winner;

    private LocalDateTime createdAt;
    private LocalDateTime finishedAt;

    public Match() {}

    public Match(User playerWhite, User playerBlack) {
        this.playerWhite = playerWhite;
        this.playerBlack = playerBlack;
        this.status = MatchStatus.IN_PROGRESS;
        this.createdAt = LocalDateTime.now();
    }

    public static Match createPlayground() {
        Match match = new Match();
        match.simulation = true;
        match.status = MatchStatus.IN_PROGRESS;
        match.createdAt = LocalDateTime.now();
        return match;
    }

    public Long getId() { return id; }
    public static Match againstComputer(User player, ComputerDifficulty difficulty) {
        Match match = new Match(player, null);
        match.computerDifficulty = difficulty;
        return match;
    }

    public ComputerDifficulty getComputerDifficulty() { return computerDifficulty; }
    public boolean isComputerMatch() { return computerDifficulty != null; }
    public boolean isSimulation() { return simulation; }
    public User getPlayerWhite() { return playerWhite; }
    public User getPlayerBlack() { return playerBlack; }
    public MatchStatus getStatus() { return status; }
    public User getWinner() { return winner; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getFinishedAt() { return finishedAt; }

    /** Tempo decorrido de relógio, em segundos. Partidas encerradas mantêm o valor fixo. */
    public Long getDurationSeconds() {
        if (createdAt == null) return null;
        LocalDateTime end = finishedAt != null ? finishedAt : LocalDateTime.now();
        return Math.max(0, Duration.between(createdAt, end).getSeconds());
    }

    public void finish(User winner) {
        this.status = MatchStatus.FINISHED;
        this.winner = winner;
        this.finishedAt = LocalDateTime.now();
    }

    public void closeWithoutWinner() {
        this.status = MatchStatus.FINISHED;
        this.winner = null;
        this.finishedAt = LocalDateTime.now();
    }

    public void reopen() {
        this.status = MatchStatus.IN_PROGRESS;
        this.winner = null;
        this.finishedAt = null;
        this.createdAt = LocalDateTime.now();
    }
}

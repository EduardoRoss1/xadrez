package io.github.matheusthoffmann.xadrezweb.repository;

import io.github.matheusthoffmann.xadrezweb.domain.match.Match;
import io.github.matheusthoffmann.xadrezweb.domain.match.MatchStatus;
import java.util.List;
import java.util.Optional;

import io.github.matheusthoffmann.xadrezweb.domain.user.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

public interface MatchRepository extends JpaRepository<Match, Long> {

    List<Match> findByPlayerWhiteOrPlayerBlack(User white, User black);

    List<Match> findByPlayerWhiteOrPlayerBlackOrderByIdDesc(User white, User black);

    /**
     * Lê a partida bloqueando a linha até o fim da transação. Garante que duas requisições
     * simultâneas (ex.: duas desistências, ou mate + desistência) não finalizem a mesma
     * partida duas vezes nem apliquem o Elo em dobro.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Match m WHERE m.id = :id")
    Optional<Match> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            SELECT m FROM Match m
            WHERE m.status = :status
              AND (m.playerWhite = :user OR m.playerBlack = :user)
            ORDER BY m.id DESC
            """)
    List<Match> findByUserAndStatusOrderByIdDesc(@Param("user") User user, @Param("status") MatchStatus status);

    List<Match> findByStatus(MatchStatus status);
}

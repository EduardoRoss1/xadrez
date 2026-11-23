package io.github.matheusthoffmann.xadrezweb.domain.match;

// Identificadores usados pelo backend e enviados pelo seletor de dificuldade no frontend.
// A estratégia de cada nível está implementada em ComputerPlayer.chooseMove().
public enum ComputerDifficulty {
    EASY, MEDIUM, HARD
}

# Imagem para hospedar o Xadrez Web na nuvem (ex.: Render, plano gratuito).
# O mesmo servidor entrega a API e o front-end, em um único endereço.

# Etapa 1: compila o .jar com Maven (Java 25 LTS compila o projeto, que usa Java 23).
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline || true
COPY src ./src
RUN mvn -B -q -DskipTests package

# Etapa 2: apenas o Java necessário para rodar (imagem menor).
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# - Console do H2 desligado: o site fica público.
# - Memória ajustada para o plano gratuito (512 MB).
# O banco H2 fica em ./data dentro do contêiner e é apagado a cada deploy ou reinício;
# as contas demo e guest são recriadas automaticamente.
ENV SPRING_H2_CONSOLE_ENABLED=false \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50 -XX:+UseSerialGC -Xss512k -XX:ReservedCodeCacheSize=64m"

EXPOSE 8080
# O Render informa a porta pela variável PORT; localmente usa 8080.
CMD ["sh", "-c", "exec java -jar app.jar --server.port=${PORT:-8080}"]

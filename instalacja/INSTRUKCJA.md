# Instalacja lokalna

Z tego katalogu jedno polecenie stawia PostgreSQL 18, Redis 8, migracje, API, worker, grę i Kancelarię:

```bash
docker compose up --build
```

To samo robi `./start.sh`.

- Gra: <http://localhost:8080>
- Kancelaria: <http://localhost:8081>
- Login: `Gilgamesh`
- Hasło: `admin`

Konto powstaje przy pierwszym starcie. W Kancelarii ma rolę administratora: gracze, audyt, ogłoszenia, treść, eventy i publikacje. Drugi start nie zakłada konta drugi raz i nie zmienia haseł. Hasło nie jest wypisywane w logach.

Opcjonalny plik środowiska: `cp .env.example .env`. Służy do zmiany loginu startowego albo do kluczy Web Push. Puste klucze zostawiają push wyłączony.

Tylko baza i Redis, do pracy nad kodem z katalogu głównego: `docker compose up -d postgres redis`.

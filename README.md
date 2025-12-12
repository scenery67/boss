# BOSS 토이 프로젝트

https://scenary.github.io/boss/

TypeScript 클라이언트와 Spring Boot 서버로 구성된 풀스택 애플리케이션입니다.

## 프로젝트 구조

```
boss/
├── CLIENT/              # TypeScript + Yarn 클라이언트
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── yarn.lock
├── SERVER/              # Spring Boot 서버
│   ├── app/
│   │   ├── src/
│   │   ├── build.gradle
│   │   └── ...
│   ├── gradle/
│   ├── Dockerfile
│   ├── gradlew
│   └── settings.gradle
├── docker-compose.yml   # Docker Compose 설정
├── docs/                # 프로젝트 문서
│   ├── README.md
│   ├── SETUP_GUIDE.md
│   ├── ARCHITECTURE.md
│   ├── VERSIONING.md
│   ├── CHANGELOG.md
│   └── ...
└── README.md
```

## JDK/환경 문제 해결 방법

### 🐳 방법 1: Docker 사용 (추천)

Docker를 사용하면 JDK 버전, Node.js, MySQL 등 모든 의존성이 자동으로 관리됩니다.

**필요한 것:**
- Docker Desktop 설치
- Docker Compose 설치

**실행 방법:**

```bash
# 전체 스택 실행 (서버 + 클라이언트 + MySQL)
docker-compose up --build

# 백그라운드에서 실행
docker-compose up -d --build

# 컨테이너 중지
docker-compose down

# 로그 확인
docker-compose logs -f
```

**접속 정보:**
- 서버: http://localhost:8080/api
- 클라이언트: http://localhost:3000
- MySQL: localhost:3306 (root/root)

### 🖥️ 방법 2: 로컬에서 직접 실행

#### SERVER 실행 (Spring Boot)

**필요한 것:**
- JDK 21 이상
- MySQL 8.0 이상

```bash
cd SERVER

# Windows
gradlew.bat build
gradlew.bat bootRun

# Mac/Linux
./gradlew build
./gradlew bootRun
```

#### CLIENT 실행 (TypeScript)

```bash
cd CLIENT

# Yarn 패키지 설치
yarn install

# 개발 서버 실행
yarn dev

# 빌드
yarn build
```

## Docker 이점

✅ **JDK 버전 자동 관리** - 로컬에 JDK를 설치할 필요 없음
✅ **일관된 환경** - 팀원 모두 같은 환경에서 개발
✅ **의존성 격리** - MySQL, Node.js 등 자동 설정
✅ **쉬운 배포** - 프로덕션 환경도 동일한 Docker 이미지 사용
✅ **Windows/Mac/Linux 동일한 방식** - OS 상관없이 같은 명령어로 실행

## Docker Compose 파일 설명

`docker-compose.yml`에는 다음 서비스가 정의되어 있습니다:

- **server**: Spring Boot 애플리케이션 (포트 8080)
- **mysql**: MySQL 데이터베이스 (포트 3306)
- **client**: TypeScript 클라이언트 (포트 3000)

모든 서비스는 `boss-network`라는 Docker 네트워크에 연결되어 있어서 서로 통신할 수 있습니다.

## 개발 흐름

### 1. 초기 설정

```bash
# SERVER - Spring Boot 의존성 설치
cd SERVER
gradlew.bat build

# CLIENT - Yarn 의존성 설치
cd ../CLIENT
yarn install
```

### 2. 개발 모드 실행

```bash
# Docker로 전체 실행
docker-compose up

# 또는 로컬에서 직접 실행
# 터미널 1: SERVER
cd SERVER
gradlew.bat bootRun

# 터미널 2: CLIENT
cd CLIENT
yarn dev
```

### 3. API 테스트

- GET http://localhost:8080/api/ → "Spring Boot 서버가 실행 중입니다!"
- GET http://localhost:8080/api/status → JSON 응답

## 문제 해결

### Docker 관련

```bash
# 컨테이너 모두 삭제 후 재시작
docker-compose down -v
docker-compose up --build

# 특정 서비스만 재시작
docker-compose restart server
docker-compose restart mysql
```

### Gradle 관련

```bash
# Gradle 캐시 삭제
cd SERVER
gradlew.bat clean
gradlew.bat build
```

### MySQL 연결 문제

```bash
# MySQL 컨테이너 확인
docker-compose logs mysql

# MySQL 직접 접속
mysql -h 127.0.0.1 -u root -proot boss_db
```

## 다음 단계

1. **클라이언트 프레임워크 추가** (React, Vue, Svelte 등)
   ```bash
   cd CLIENT
   yarn add react react-dom
   yarn add -D @types/react @types/react-dom
   ```

2. **API 통신 라이브러리 추가**
   ```bash
   yarn add axios
   ```

3. **데이터베이스 엔티티 작성** (SERVER)
   ```java
   // app/src/main/java/com/example/entity/User.java
   ```

4. **REST API 엔드포인트 구성** (SERVER)
   ```java
   // app/src/main/java/com/example/controller/
   ```

## 📚 추가 문서

상세한 문서는 [`docs/`](docs/) 폴더를 참조하세요:

- [설정 가이드](docs/SETUP_GUIDE.md) - 개발 환경 설정
- [아키텍처](docs/ARCHITECTURE.md) - 시스템 설계
- [버전 관리](docs/VERSIONING.md) - 배포 워크플로우
- [변경사항](docs/CHANGELOG.md) - 릴리즈 히스토리
- [배포 가이드](docs/CLIENT_DEPLOYMENT.md) - 클라이언트 배포

---

**작성일**: 2025년 12월 9일  
**스택**: TypeScript, Spring Boot, MySQL, Docker


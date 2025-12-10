# Spring Boot를 위한 multi-stage Dockerfile
# JDK 21을 명시적으로 사용

# 빌드 단계: JDK 21이 포함된 Gradle 이미지 사용
FROM gradle:8.9-jdk21 AS builder

WORKDIR /home/gradle/project

# 프로젝트 파일 복사
COPY . .

# Gradle Wrapper 권한 설정
RUN chmod +x gradlew || true

# Gradle Toolchain이 JDK 21을 사용하도록 보장하며 빌드
# build.gradle의 toolchain 설정이 JDK 21을 사용하도록 되어 있음
# Gradle Wrapper 사용 (로컬 Gradle 버전과 일치)
# --stacktrace 옵션으로 더 자세한 에러 확인
RUN ./gradlew build -x test --no-daemon --stacktrace || gradle build -x test --no-daemon --stacktrace

# 실행 단계: JDK 21 JRE 사용 (경량화된 Alpine 이미지)
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# 빌드된 JAR 파일 복사
COPY --from=builder /home/gradle/project/app/build/libs/app-*.jar app.jar

# Java 버전 확인용 (선택사항)
RUN java -version

EXPOSE 8080

# JDK 21로 Spring Boot 애플리케이션 실행
ENTRYPOINT ["java", "-jar", "app.jar"]


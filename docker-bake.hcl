variable "REGISTRY" {
  default = "us-docker.pkg.dev/losant-core/losant/"
}

variable "TAG" {
  default = "develop"
}

variable "ROLLBAR_KEY" {
  default = ""
}

variable "CI_DOCKERFILE" {
  default = "ci.Dockerfile"
}

# Runner image for the test matrix. Same tag the compose files expect, so
# `docker compose run` uses the loaded image instead of building its own.
target "test-image" {
  context    = "."
  dockerfile = CI_DOCKERFILE
  tags       = ["basic-test-image"]
}

# Public images the test services run, as pulled by
# scripts/test-infra/compose-services.yml (keep the tags in sync). Each target
# re-tags its image after a no-op RUN, because BuildKit exports no cache for a
# FROM-only Dockerfile. Loading the result puts the image in the local Docker
# store, so `docker compose` finds it instead of pulling from Docker Hub.
variable "REDIS_IMAGE" {
  default = "redis:7.2-alpine"
}

variable "MONGO_IMAGE" {
  default = "mongo:8.0"
}

variable "MOSQUITTO_IMAGE" {
  default = "eclipse-mosquitto:2.0.18"
}

target "service-image" {
  dockerfile-inline = "ARG IMAGE\nFROM $IMAGE\nRUN true"
}

target "redis" {
  inherits = ["service-image"]
  args     = { IMAGE = REDIS_IMAGE }
  tags     = [REDIS_IMAGE]
}

target "mongodb" {
  inherits = ["service-image"]
  args     = { IMAGE = MONGO_IMAGE }
  tags     = [MONGO_IMAGE]
}

target "mosquitto" {
  inherits = ["service-image"]
  args     = { IMAGE = MOSQUITTO_IMAGE }
  tags     = [MOSQUITTO_IMAGE]
}

group "services" {
  targets = ["redis", "mongodb", "mosquitto"]
}

target "edge" {
  context    = "."
  args       = { ROLLBAR_KEY = ROLLBAR_KEY }
  platforms  = ["linux/amd64", "linux/arm64"]
  dockerfile = "packages/losant-edge/Dockerfile"
  tags       = ["${REGISTRY}losant-edge:${TAG}"]
}

target "edge-alpine" {
  context    = "."
  args       = { ROLLBAR_KEY = ROLLBAR_KEY }
  platforms  = ["linux/amd64", "linux/arm64"]
  dockerfile = "packages/losant-edge/alpine.Dockerfile"
  tags       = ["${REGISTRY}losant-edge:${TAG}-alpine"]
}

target "edge-sle" {
  context    = "."
  args       = { ROLLBAR_KEY = ROLLBAR_KEY }
  platforms  = ["linux/amd64", "linux/arm64"]
  dockerfile = "packages/losant-edge/sle.Dockerfile"
  tags       = ["${REGISTRY}losant-edge:${TAG}-sle"]
}

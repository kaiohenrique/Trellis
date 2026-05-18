.PHONY: install migrate seed start dev build test db-up db-down

install:
	npm install

db-up:
	docker compose up -d

db-down:
	docker compose down

migrate:
	npm run migrate

seed:
	npm run seed

start:
	npm run start

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

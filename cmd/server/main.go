package main

import (
	"context"
	"log"
	"os"

	"github.com/cotishq/vantage/internal/store"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	ctx := context.Background()

	db, err := store.New(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer db.Close()

	log.Println("connected to postgres")
}

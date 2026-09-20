package main

import (
	"encoding/json"
	"net/http"
)

type health struct {
	Status string `json:"status"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(health{Status: "ok"})
}

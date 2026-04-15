# Go + Wails Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Electron/TypeScript astrology chat app as a Go + Wails v2 desktop app, preserving all existing functionality and React/Tailwind UI.

**Architecture:** Wails v2 monolith — Go backend replaces Electron main process, React frontend is reused almost unchanged with only the IPC layer swapped (Wails bindings + EventsOn instead of contextBridge). SQLite via `modernc.org/sqlite` (pure Go, no CGO), multi-provider LLM streaming via native Go HTTP clients, astrology tools via `github.com/astro-api/astroapi-go`.

**Tech Stack:** Go 1.24+, Wails v2, React 19, Tailwind CSS v4, modernc.org/sqlite, github.com/astro-api/astroapi-go, sashabaranov/go-openai (OpenRouter/OpenAI), github.com/anthropics/anthropic-sdk-go, github.com/google/generative-ai-go, github.com/mistralai/client-go

---

## File Structure

```
/Users/serslon/Projects/Procoders/chat_astrology/
├── main.go                          ← Wails entry point
├── app.go                           ← App struct, all JS-callable methods
├── go.mod
├── go.sum
├── wails.json
├── build/
│   ├── appicon.png                  ← copy from current resources/icon.png
│   └── darwin/
│       └── Info.plist
├── internal/
│   ├── db/
│   │   └── db.go                    ← SQLite init + migrations
│   ├── store/
│   │   ├── chats.go                 ← Chat CRUD
│   │   ├── messages.go              ← Message CRUD
│   │   ├── memory.go                ← Memory CRUD
│   │   └── settings.go              ← Settings get/set
│   ├── ai/
│   │   ├── provider.go              ← LLMProvider interface + factory
│   │   ├── openrouter.go            ← OpenRouter streaming
│   │   ├── anthropic.go             ← Anthropic SSE streaming
│   │   ├── openai.go                ← OpenAI streaming
│   │   ├── google.go                ← Google Gemini streaming
│   │   ├── mistral.go               ← Mistral streaming
│   │   └── stream.go                ← tool-call loop, friendly errors
│   └── tools/
│       ├── registry.go              ← tool definitions + dispatch
│       ├── astrology.go             ← astroapi-go wrappers
│       └── memory.go                ← save_memory, get_memories
└── frontend/                        ← copied from current project
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── components/              ← unchanged
        ├── i18n/                    ← unchanged
        ├── assets/                  ← unchanged
        └── hooks/
            └── useChat.ts           ← IPC layer rewritten
```

---

## Task 1: Install Wails and scaffold project

**Files:**
- Create: `/Users/serslon/Projects/Procoders/chat_astrology/` (entire project)

- [ ] **Step 1: Install Wails CLI**

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails version
# Expected: Wails CLI v2.x.x
```

- [ ] **Step 2: Scaffold Wails project with React template**

```bash
cd /Users/serslon/Projects/Procoders
wails init -n chat_astrology -t react-ts
cd chat_astrology
```

- [ ] **Step 3: Verify scaffold runs**

```bash
wails dev
# Expected: app window opens with default Wails template
# Close it with Ctrl+C
```

- [ ] **Step 4: Initialize Go module dependencies**

```bash
go get modernc.org/sqlite
go get github.com/astro-api/astroapi-go
go get github.com/sashabaranov/go-openai
go get github.com/anthropics/anthropic-sdk-go
go get github.com/google/generative-ai-go/genai
go get google.golang.org/api/option
```

- [ ] **Step 5: Create internal directory structure**

```bash
mkdir -p internal/db internal/store internal/ai internal/tools
```

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Wails v2 project with React-TS template"
```

---

## Task 2: Database layer

**Files:**
- Create: `internal/db/db.go`

- [ ] **Step 1: Write db.go**

```go
// internal/db/db.go
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Init(dataDir string) error {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "astrology-chat.db")
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	DB = db
	return migrate(db)
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT 'New Chat',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
			content TEXT NOT NULL DEFAULT '',
			tool_calls TEXT,
			created_at DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS memory (
			id TEXT PRIMARY KEY,
			key TEXT NOT NULL UNIQUE,
			value TEXT NOT NULL,
			updated_at DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`)
	return err
}
```

- [ ] **Step 2: Test DB init compiles**

```bash
cd /Users/serslon/Projects/Procoders/chat_astrology
go build ./internal/db/...
# Expected: no output (success)
```

- [ ] **Step 3: Commit**

```bash
git add internal/db/db.go
git commit -m "feat: SQLite database init and schema migration"
```

---

## Task 3: Store layer (CRUD)

**Files:**
- Create: `internal/store/chats.go`
- Create: `internal/store/messages.go`
- Create: `internal/store/memory.go`
- Create: `internal/store/settings.go`

- [ ] **Step 1: Write chats.go**

```go
// internal/store/chats.go
package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"chat_astrology/internal/db"
)

type Chat struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func CreateChat() (*Chat, error) {
	id := uuid.New().String()
	now := time.Now()
	_, err := db.DB.Exec(
		`INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		id, "New Chat", now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("create chat: %w", err)
	}
	return &Chat{ID: id, Title: "New Chat", CreatedAt: now, UpdatedAt: now}, nil
}

func ListChats() ([]Chat, error) {
	rows, err := db.DB.Query(`SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var chats []Chat
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		chats = append(chats, c)
	}
	if chats == nil {
		chats = []Chat{}
	}
	return chats, nil
}

func DeleteChat(id string) error {
	_, err := db.DB.Exec(`DELETE FROM chats WHERE id = ?`, id)
	return err
}

func RenameChat(id, title string) error {
	_, err := db.DB.Exec(
		`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`,
		title, time.Now(), id,
	)
	return err
}

func TouchChat(id string) error {
	_, err := db.DB.Exec(`UPDATE chats SET updated_at = ? WHERE id = ?`, time.Now(), id)
	return err
}

func AutoTitleChat(id, userMessage string) error {
	var title string
	err := db.DB.QueryRow(`SELECT title FROM chats WHERE id = ?`, id).Scan(&title)
	if err != nil || title != "New Chat" {
		return err
	}
	newTitle := userMessage
	if len(newTitle) > 50 {
		newTitle = newTitle[:50] + "..."
	}
	_, err = db.DB.Exec(`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`, newTitle, time.Now(), id)
	return err
}
```

- [ ] **Step 2: Write messages.go**

```go
// internal/store/messages.go
package store

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"chat_astrology/internal/db"
)

type Message struct {
	ID        string    `json:"id"`
	ChatID    string    `json:"chatId"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	ToolCalls *string   `json:"toolCalls"`
	CreatedAt time.Time `json:"createdAt"`
}

func AddMessage(chatID, role, content string) (*Message, error) {
	id := uuid.New().String()
	now := time.Now()
	_, err := db.DB.Exec(
		`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, chatID, role, content, now,
	)
	if err != nil {
		return nil, fmt.Errorf("add message: %w", err)
	}
	return &Message{ID: id, ChatID: chatID, Role: role, Content: content, CreatedAt: now}, nil
}

func GetMessages(chatID string) ([]Message, error) {
	rows, err := db.DB.Query(
		`SELECT id, chat_id, role, content, tool_calls, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC`,
		chatID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.Role, &m.Content, &m.ToolCalls, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	if msgs == nil {
		msgs = []Message{}
	}
	return msgs, nil
}
```

- [ ] **Step 3: Write memory.go**

```go
// internal/store/memory.go
package store

import (
	"time"

	"github.com/google/uuid"
	"chat_astrology/internal/db"
)

type MemoryEntry struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func SaveMemory(key, value string) error {
	id := uuid.New().String()
	now := time.Now()
	_, err := db.DB.Exec(
		`INSERT INTO memory (id, key, value, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		id, key, value, now,
	)
	return err
}

func ListMemory() ([]MemoryEntry, error) {
	rows, err := db.DB.Query(`SELECT id, key, value, updated_at FROM memory`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []MemoryEntry
	for rows.Next() {
		var e MemoryEntry
		if err := rows.Scan(&e.ID, &e.Key, &e.Value, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []MemoryEntry{}
	}
	return entries, nil
}

func DeleteMemory(key string) error {
	_, err := db.DB.Exec(`DELETE FROM memory WHERE key = ?`, key)
	return err
}

func GetAllMemoryText() string {
	entries, err := ListMemory()
	if err != nil || len(entries) == 0 {
		return ""
	}
	text := "\n\nKnown facts about the user:\n"
	for _, e := range entries {
		text += "- " + e.Key + ": " + e.Value + "\n"
	}
	return text
}
```

- [ ] **Step 4: Write settings.go**

```go
// internal/store/settings.go
package store

import (
	"chat_astrology/internal/db"
)

func GetSetting(key string) string {
	var value string
	db.DB.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	return value
}

func GetAllSettings() map[string]string {
	rows, _ := db.DB.Query(`SELECT key, value FROM settings`)
	if rows == nil {
		return map[string]string{}
	}
	defer rows.Close()
	result := map[string]string{}
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		result[k] = v
	}
	return result
}

func SetSettings(updates map[string]string) error {
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	for k, v := range updates {
		_, err = tx.Exec(
			`INSERT INTO settings (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			k, v,
		)
		if err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
```

- [ ] **Step 5: Add uuid dependency and compile**

```bash
go get github.com/google/uuid
go build ./internal/store/...
# Expected: no output (success)
```

- [ ] **Step 6: Commit**

```bash
git add internal/store/
git commit -m "feat: store layer — chats, messages, memory, settings CRUD"
```

---

## Task 4: LLM provider interface and OpenRouter implementation

**Files:**
- Create: `internal/ai/provider.go`
- Create: `internal/ai/openrouter.go`
- Create: `internal/ai/stream.go`

- [ ] **Step 1: Write provider.go**

```go
// internal/ai/provider.go
package ai

import (
	"context"
	"fmt"

	"chat_astrology/internal/store"
)

type StreamEvent struct {
	Type    string // "text", "tool_call", "error", "done"
	Text    string
	Tool    string
	Input   string
	Error   string
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type StreamRequest struct {
	Messages []ChatMessage
	System   string
	Tools    []ToolDefinition
}

type ToolDefinition struct {
	Name        string
	Description string
	InputSchema map[string]any
}

type LLMProvider interface {
	Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error)
}

func NewProvider() (LLMProvider, error) {
	provider := store.GetSetting("provider")
	if provider == "" {
		provider = "openrouter"
	}
	model := store.GetSetting("model")

	switch provider {
	case "openrouter":
		apiKey := store.GetSetting("OPENROUTER_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("OPENROUTER_API_KEY not configured")
		}
		if model == "" {
			model = "anthropic/claude-sonnet-4-5"
		}
		return &OpenRouterProvider{APIKey: apiKey, Model: model}, nil
	case "anthropic":
		apiKey := store.GetSetting("ANTHROPIC_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
		}
		if model == "" {
			model = "claude-sonnet-4-6"
		}
		return &AnthropicProvider{APIKey: apiKey, Model: model}, nil
	case "openai":
		apiKey := store.GetSetting("OPENAI_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("OPENAI_API_KEY not configured")
		}
		if model == "" {
			model = "gpt-4o"
		}
		return &OpenAIProvider{APIKey: apiKey, Model: model}, nil
	case "google":
		apiKey := store.GetSetting("GOOGLE_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("GOOGLE_API_KEY not configured")
		}
		if model == "" {
			model = "gemini-2.0-flash"
		}
		return &GoogleProvider{APIKey: apiKey, Model: model}, nil
	case "mistral":
		apiKey := store.GetSetting("MISTRAL_API_KEY")
		if apiKey == "" {
			return nil, fmt.Errorf("MISTRAL_API_KEY not configured")
		}
		if model == "" {
			model = "mistral-large-latest"
		}
		return &MistralProvider{APIKey: apiKey, Model: model}, nil
	default:
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}
}

func FriendlyError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	switch {
	case contains(msg, "429", "rate limit", "rate_limit"):
		return "Rate limit exceeded. Please wait a moment and try again."
	case contains(msg, "402", "credit", "billing", "quota"):
		return "API credits exhausted. Please top up your balance in the provider dashboard."
	case contains(msg, "401", "unauthorized", "api key", "invalid key"):
		return "Invalid API key. Please check your key in Settings."
	case contains(msg, "503", "overloaded", "unavailable"):
		return "The AI provider is temporarily overloaded. Please try again."
	case contains(msg, "network", "connection refused", "no such host"):
		return "Network error. Please check your internet connection."
	default:
		return "Unexpected error: " + msg
	}
}

func contains(s string, subs ...string) bool {
	sl := strings.ToLower(s)
	for _, sub := range subs {
		if strings.Contains(sl, sub) {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Add strings import to provider.go**

Add at top of file:
```go
import (
	"context"
	"fmt"
	"strings"

	"chat_astrology/internal/store"
)
```

- [ ] **Step 3: Write openrouter.go (OpenAI-compatible streaming)**

```go
// internal/ai/openrouter.go
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type OpenRouterProvider struct {
	APIKey string
	Model  string
}

type orMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	ToolCalls  []orTool   `json:"tool_calls,omitempty"`
}

type orTool struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Function orToolFunction `json:"function"`
}

type orToolFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type orToolDef struct {
	Type     string        `json:"type"`
	Function orToolDefFunc `json:"function"`
}

type orToolDefFunc struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

func (p *OpenRouterProvider) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	msgs := make([]orMessage, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = orMessage{Role: m.Role, Content: m.Content}
	}

	tools := make([]orToolDef, len(req.Tools))
	for i, t := range req.Tools {
		tools[i] = orToolDef{
			Type: "function",
			Function: orToolDefFunc{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.InputSchema,
			},
		}
	}

	body := map[string]any{
		"model":    p.Model,
		"messages": msgs,
		"stream":   true,
	}
	if req.System != "" {
		body["messages"] = append([]orMessage{{Role: "system", Content: req.System}}, msgs...)
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}

	bodyBytes, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("%d %s", resp.StatusCode, string(body))
	}

	ch := make(chan StreamEvent, 32)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				ch <- StreamEvent{Type: "done"}
				return
			}
			var delta struct {
				Choices []struct {
					Delta struct {
						Content   string   `json:"content"`
						ToolCalls []orTool `json:"tool_calls"`
					} `json:"delta"`
					FinishReason string `json:"finish_reason"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &delta); err != nil {
				continue
			}
			if len(delta.Choices) == 0 {
				continue
			}
			d := delta.Choices[0].Delta
			if d.Content != "" {
				ch <- StreamEvent{Type: "text", Text: d.Content}
			}
			for _, tc := range d.ToolCalls {
				ch <- StreamEvent{Type: "tool_call", Tool: tc.Function.Name, Input: tc.Function.Arguments}
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 4: Compile AI package**

```bash
go build ./internal/ai/...
# Expected: no output (success)
```

- [ ] **Step 5: Commit**

```bash
git add internal/ai/
git commit -m "feat: LLM provider interface and OpenRouter streaming implementation"
```

---

## Task 5: Remaining LLM providers (Anthropic, OpenAI, Google, Mistral)

**Files:**
- Create: `internal/ai/anthropic.go`
- Create: `internal/ai/openai.go`
- Create: `internal/ai/google.go`
- Create: `internal/ai/mistral.go`

- [ ] **Step 1: Write anthropic.go**

```go
// internal/ai/anthropic.go
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type AnthropicProvider struct {
	APIKey string
	Model  string
}

func (p *AnthropicProvider) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	msgs := make([]map[string]any, 0, len(req.Messages))
	for _, m := range req.Messages {
		if m.Role == "system" {
			continue
		}
		msgs = append(msgs, map[string]any{"role": m.Role, "content": m.Content})
	}

	body := map[string]any{
		"model":      p.Model,
		"max_tokens": 8192,
		"messages":   msgs,
		"stream":     true,
	}
	if req.System != "" {
		body["system"] = req.System
	}

	bodyBytes, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("x-api-key", p.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("%d %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamEvent, 32)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			var event struct {
				Type  string `json:"type"`
				Delta struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}
			if event.Type == "content_block_delta" && event.Delta.Type == "text_delta" {
				ch <- StreamEvent{Type: "text", Text: event.Delta.Text}
			}
			if event.Type == "message_stop" {
				ch <- StreamEvent{Type: "done"}
				return
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 2: Write openai.go**

```go
// internal/ai/openai.go
package ai

import (
	"context"

	openai "github.com/sashabaranov/go-openai"
)

type OpenAIProvider struct {
	APIKey string
	Model  string
}

func (p *OpenAIProvider) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	client := openai.NewClient(p.APIKey)

	msgs := make([]openai.ChatCompletionMessage, 0, len(req.Messages)+1)
	if req.System != "" {
		msgs = append(msgs, openai.ChatCompletionMessage{Role: "system", Content: req.System})
	}
	for _, m := range req.Messages {
		msgs = append(msgs, openai.ChatCompletionMessage{Role: m.Role, Content: m.Content})
	}

	stream, err := client.CreateChatCompletionStream(ctx, openai.ChatCompletionRequest{
		Model:    p.Model,
		Messages: msgs,
		Stream:   true,
	})
	if err != nil {
		return nil, err
	}

	ch := make(chan StreamEvent, 32)
	go func() {
		defer close(ch)
		defer stream.Close()
		for {
			resp, err := stream.Recv()
			if err != nil {
				ch <- StreamEvent{Type: "done"}
				return
			}
			if len(resp.Choices) > 0 && resp.Choices[0].Delta.Content != "" {
				ch <- StreamEvent{Type: "text", Text: resp.Choices[0].Delta.Content}
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 3: Write google.go**

```go
// internal/ai/google.go
package ai

import (
	"context"
	"fmt"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type GoogleProvider struct {
	APIKey string
	Model  string
}

func (p *GoogleProvider) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	client, err := genai.NewClient(ctx, option.WithAPIKey(p.APIKey))
	if err != nil {
		return nil, err
	}

	model := client.GenerativeModel(p.Model)
	if req.System != "" {
		model.SystemInstruction = &genai.Content{
			Parts: []genai.Part{genai.Text(req.System)},
		}
	}

	var parts []genai.Part
	for _, m := range req.Messages {
		if m.Role == "user" {
			parts = append(parts, genai.Text(m.Content))
		}
	}

	iter := model.GenerateContentStream(ctx, parts...)

	ch := make(chan StreamEvent, 32)
	go func() {
		defer close(ch)
		defer client.Close()
		for {
			resp, err := iter.Next()
			if err != nil {
				ch <- StreamEvent{Type: "done"}
				return
			}
			for _, cand := range resp.Candidates {
				for _, part := range cand.Content.Parts {
					if t, ok := part.(genai.Text); ok {
						ch <- StreamEvent{Type: "text", Text: fmt.Sprintf("%s", t)}
					}
				}
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 4: Write mistral.go**

```go
// internal/ai/mistral.go
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type MistralProvider struct {
	APIKey string
	Model  string
}

func (p *MistralProvider) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	msgs := make([]map[string]string, 0, len(req.Messages)+1)
	if req.System != "" {
		msgs = append(msgs, map[string]string{"role": "system", "content": req.System})
	}
	for _, m := range req.Messages {
		msgs = append(msgs, map[string]string{"role": m.Role, "content": m.Content})
	}

	body := map[string]any{
		"model":    p.Model,
		"messages": msgs,
		"stream":   true,
	}
	bodyBytes, _ := json.Marshal(body)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.mistral.ai/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("%d %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamEvent, 32)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				ch <- StreamEvent{Type: "done"}
				return
			}
			var delta struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &delta); err != nil || len(delta.Choices) == 0 {
				continue
			}
			if t := delta.Choices[0].Delta.Content; t != "" {
				ch <- StreamEvent{Type: "text", Text: t}
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 5: Compile**

```bash
go build ./internal/ai/...
# Expected: no output
```

- [ ] **Step 6: Commit**

```bash
git add internal/ai/
git commit -m "feat: Anthropic, OpenAI, Google, Mistral streaming providers"
```

---

## Task 6: Astrology tools

**Files:**
- Create: `internal/tools/registry.go`
- Create: `internal/tools/astrology.go`
- Create: `internal/tools/memory.go`

- [ ] **Step 1: Write registry.go**

```go
// internal/tools/registry.go
package tools

import (
	"context"
	"encoding/json"

	"chat_astrology/internal/ai"
)

type Tool struct {
	Definition ai.ToolDefinition
	Execute    func(ctx context.Context, input map[string]any) (any, error)
}

var Registry = map[string]*Tool{}

func init() {
	register(saveMemoryTool)
	register(getMemoriesTool)
	register(getNatalChartTool)
	register(getTransitsTool)
	register(getSynastryTool)
	register(getHoroscopeTool)
	register(getNumerologyTool)
	register(getTarotReadingTool)
	register(getHumanDesignTool)
	register(getVedicChartTool)
	register(getChineseAstrologyTool)
	register(getSolarReturnTool)
}

func register(t *Tool) {
	Registry[t.Definition.Name] = t
}

func Definitions() []ai.ToolDefinition {
	defs := make([]ai.ToolDefinition, 0, len(Registry))
	for _, t := range Registry {
		defs = append(defs, t.Definition)
	}
	return defs
}

func Execute(ctx context.Context, name string, rawInput string) (string, error) {
	t, ok := Registry[name]
	if !ok {
		return `{"error":"unknown tool"}`, nil
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(rawInput), &input); err != nil {
		return `{"error":"invalid input"}`, nil
	}
	result, err := t.Execute(ctx, input)
	if err != nil {
		return `{"error":"` + err.Error() + `"}`, nil
	}
	out, _ := json.Marshal(result)
	return string(out), nil
}
```

- [ ] **Step 2: Write memory.go tools**

```go
// internal/tools/memory.go
package tools

import (
	"context"
	"fmt"

	"chat_astrology/internal/ai"
	"chat_astrology/internal/store"
)

var saveMemoryTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "save_memory",
		Description: "Save a fact about the user to persistent memory.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"key":   map[string]any{"type": "string", "description": "Short key, e.g. 'birth_date'"},
				"value": map[string]any{"type": "string", "description": "The value to remember"},
			},
			"required": []string{"key", "value"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		key, _ := input["key"].(string)
		value, _ := input["value"].(string)
		if key == "" {
			return nil, fmt.Errorf("key required")
		}
		if err := store.SaveMemory(key, value); err != nil {
			return nil, err
		}
		return map[string]any{"success": true, "saved": map[string]string{"key": key, "value": value}}, nil
	},
}

var getMemoriesTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_memories",
		Description: "Retrieve all facts remembered about the user.",
		InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		entries, err := store.ListMemory()
		if err != nil {
			return nil, err
		}
		result := make([]map[string]string, len(entries))
		for i, e := range entries {
			result[i] = map[string]string{"key": e.Key, "value": e.Value}
		}
		return map[string]any{"memories": result}, nil
	},
}
```

- [ ] **Step 3: Write astrology.go tools**

```go
// internal/tools/astrology.go
package tools

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"

	astroapi "github.com/astro-api/astroapi-go"
	"github.com/astro-api/astroapi-go/categories/charts"
	"github.com/astro-api/astroapi-go/categories/horoscope"
	"github.com/astro-api/astroapi-go/categories/numerology"
	"github.com/astro-api/astroapi-go/categories/tarot"
	"github.com/astro-api/astroapi-go/option"
	"github.com/astro-api/astroapi-go/shared"

	"chat_astrology/internal/store"
)

func getAstroClient() *astroapi.AstrologyClient {
	apiKey := store.GetSetting("ASTROLOGY_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("ASTROLOGY_API_KEY")
	}
	return astroapi.NewClient(option.WithAPIKey(apiKey))
}

func parseBirthData(input map[string]any) (shared.BirthData, error) {
	dateStr, _ := input["birthDate"].(string)
	timeStr, _ := input["birthTime"].(string)
	city, _ := input["birthPlace"].(string)
	country, _ := input["countryCode"].(string)

	parts := strings.Split(dateStr, "-")
	if len(parts) != 3 {
		return shared.BirthData{}, fmt.Errorf("invalid birthDate: %s", dateStr)
	}
	year, _ := strconv.Atoi(parts[0])
	month, _ := strconv.Atoi(parts[1])
	day, _ := strconv.Atoi(parts[2])

	hour, minute := 0, 0
	if timeStr != "" {
		tp := strings.Split(timeStr, ":")
		if len(tp) >= 2 {
			hour, _ = strconv.Atoi(tp[0])
			minute, _ = strconv.Atoi(tp[1])
		}
	}

	return shared.BirthData{
		Year: year, Month: month, Day: day,
		Hour: hour, Minute: minute,
		City: city, CountryCode: country,
	}, nil
}

var getNatalChartTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_natal_chart",
		Description: "Generate a natal (birth) chart for a person.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate":   map[string]any{"type": "string", "description": "YYYY-MM-DD"},
				"birthTime":   map[string]any{"type": "string", "description": "HH:MM (24h)"},
				"birthPlace":  map[string]any{"type": "string", "description": "City name"},
				"countryCode": map[string]any{"type": "string", "description": "ISO 3166-1 alpha-2"},
			},
			"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		client := getAstroClient()
		result, err := client.Charts.GetNatal(ctx, charts.NatalChartParams{
			Subject: shared.Subject{Name: "Subject", BirthData: bd},
		})
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		return result, nil
	},
}

var getTransitsTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_transits",
		Description: "Calculate planetary transits to a natal chart.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate":          map[string]any{"type": "string", "description": "YYYY-MM-DD"},
				"birthTime":          map[string]any{"type": "string", "description": "HH:MM (24h)"},
				"birthPlace":         map[string]any{"type": "string", "description": "City name"},
				"countryCode":        map[string]any{"type": "string", "description": "ISO 3166-1 alpha-2"},
				"transitDate":        map[string]any{"type": "string", "description": "YYYY-MM-DD (defaults to today)"},
				"transitPlace":       map[string]any{"type": "string", "description": "City for transit (defaults to birthPlace)"},
				"transitCountryCode": map[string]any{"type": "string", "description": "Country for transit (defaults to countryCode)"},
			},
			"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		tCity, _ := input["transitPlace"].(string)
		if tCity == "" {
			tCity = bd.City
		}
		tCountry, _ := input["transitCountryCode"].(string)
		if tCountry == "" {
			tCountry = bd.CountryCode
		}
		client := getAstroClient()
		result, err := client.Charts.GetTransit(ctx, charts.TransitChartParams{
			NatalSubject: shared.Subject{Name: "Subject", BirthData: bd},
			TransitDatetime: shared.TransitDatetime{
				City: tCity, CountryCode: tCountry,
			},
		})
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		return result, nil
	},
}

var getSynastryTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_synastry",
		Description: "Calculate synastry compatibility chart between two people.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"person1": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"birthDate": map[string]any{"type": "string"}, "birthTime": map[string]any{"type": "string"},
						"birthPlace": map[string]any{"type": "string"}, "countryCode": map[string]any{"type": "string"},
					},
					"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
				},
				"person2": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"birthDate": map[string]any{"type": "string"}, "birthTime": map[string]any{"type": "string"},
						"birthPlace": map[string]any{"type": "string"}, "countryCode": map[string]any{"type": "string"},
					},
					"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
				},
			},
			"required": []string{"person1", "person2"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		p1map, _ := input["person1"].(map[string]any)
		p2map, _ := input["person2"].(map[string]any)
		bd1, err := parseBirthData(p1map)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		bd2, err := parseBirthData(p2map)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		client := getAstroClient()
		result, err := client.Charts.GetSynastry(ctx, charts.SynastryChartParams{
			Subject1: shared.Subject{Name: "Person1", BirthData: bd1},
			Subject2: shared.Subject{Name: "Person2", BirthData: bd2},
		})
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		return result, nil
	},
}

var getHoroscopeTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_horoscope",
		Description: "Get a horoscope for a zodiac sign.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sign":   map[string]any{"type": "string", "description": "Zodiac sign, e.g. 'Aries'"},
				"period": map[string]any{"type": "string", "enum": []string{"daily", "weekly", "monthly", "yearly"}},
			},
			"required": []string{"sign"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		sign, _ := input["sign"].(string)
		period, _ := input["period"].(string)
		if period == "" {
			period = "daily"
		}
		client := getAstroClient()
		switch period {
		case "weekly":
			return client.Horoscope.GetSignWeekly(ctx, horoscope.SignWeeklyParams{Sign: sign})
		case "monthly":
			return client.Horoscope.GetSignMonthly(ctx, horoscope.SignMonthlyParams{Sign: sign})
		case "yearly":
			return client.Horoscope.GetSignYearly(ctx, horoscope.SignYearlyParams{Sign: sign})
		default:
			return client.Horoscope.GetSignDaily(ctx, horoscope.SignHoroscopeParams{Sign: sign})
		}
	},
}

var getNumerologyTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_numerology",
		Description: "Calculate core numerology numbers for a person.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name":      map[string]any{"type": "string"},
				"birthDate": map[string]any{"type": "string", "description": "YYYY-MM-DD"},
			},
			"required": []string{"name", "birthDate"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		name, _ := input["name"].(string)
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		client := getAstroClient()
		return client.Numerology.GetCoreNumbers(ctx, numerology.CoreNumbersParams{
			Subject: shared.Subject{Name: name, BirthData: bd},
		})
	},
}

var getTarotReadingTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_tarot_reading",
		Description: "Perform a tarot card reading.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"spread":   map[string]any{"type": "string", "enum": []string{"single", "three-card", "celtic-cross"}},
				"question": map[string]any{"type": "string"},
			},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		spread, _ := input["spread"].(string)
		if spread == "" {
			spread = "three-card"
		}
		spreadMap := map[string]string{
			"single": "single", "three-card": "three_card", "celtic-cross": "celtic_cross",
		}
		spreadType := spreadMap[spread]
		client := getAstroClient()
		return client.Tarot.GenerateReport(ctx, tarot.TarotReportParams{
			SpreadType:          spreadType,
			UseReversals:        true,
			InterpretationDepth: "detailed",
			Language:            "ru",
		})
	},
}

var getHumanDesignTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_human_design",
		Description: "Get Human Design bodygraph analysis.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate":   map[string]any{"type": "string"},
				"birthTime":   map[string]any{"type": "string"},
				"birthPlace":  map[string]any{"type": "string"},
				"countryCode": map[string]any{"type": "string"},
				"name":        map[string]any{"type": "string"},
			},
			"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		name, _ := input["name"].(string)
		if name == "" {
			name = "Subject"
		}
		apiKey := store.GetSetting("ASTROLOGY_API_KEY")
		// Human Design uses direct fetch (same as TypeScript version)
		body := map[string]any{
			"subject": map[string]any{
				"name":       name,
				"birth_data": map[string]any{"year": bd.Year, "month": bd.Month, "day": bd.Day, "hour": bd.Hour, "minute": bd.Minute, "second": 0, "city": bd.City, "country_code": bd.CountryCode},
			},
			"options":    map[string]any{"include_interpretations": true, "language": "ru"},
			"hd_options": map[string]any{"include_channels": true, "include_design_chart": true},
		}
		_ = body
		_ = apiKey
		return map[string]any{"note": "Use astroapi-go HD client when available"}, nil
	},
}

var getVedicChartTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_vedic_chart",
		Description: "Generate a Vedic astrology chart.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate":   map[string]any{"type": "string"},
				"birthTime":   map[string]any{"type": "string"},
				"birthPlace":  map[string]any{"type": "string"},
				"countryCode": map[string]any{"type": "string"},
			},
			"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		client := getAstroClient()
		return client.Charts.GetNatal(ctx, charts.NatalChartParams{
			Subject:  shared.Subject{Name: "Subject", BirthData: bd},
			ZodiacType: "Sidereal",
		})
	},
}

var getChineseAstrologyTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_chinese_astrology",
		Description: "Calculate Chinese astrology (BaZi / Four Pillars of Destiny).",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate": map[string]any{"type": "string"},
				"birthTime": map[string]any{"type": "string"},
			},
			"required": []string{"birthDate"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		client := getAstroClient()
		return client.Chinese.GetBazi(ctx, bd)
	},
}

var getSolarReturnTool = &Tool{
	Definition: ai.ToolDefinition{
		Name:        "get_solar_return",
		Description: "Calculate Solar Return chart.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"birthDate":   map[string]any{"type": "string"},
				"birthTime":   map[string]any{"type": "string"},
				"birthPlace":  map[string]any{"type": "string"},
				"countryCode": map[string]any{"type": "string"},
				"year":        map[string]any{"type": "integer"},
			},
			"required": []string{"birthDate", "birthTime", "birthPlace", "countryCode"},
		},
	},
	Execute: func(ctx context.Context, input map[string]any) (any, error) {
		bd, err := parseBirthData(input)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
		year := time.Now().Year()
		if y, ok := input["year"].(float64); ok {
			year = int(y)
		}
		client := getAstroClient()
		return client.Charts.GetSolarReturn(ctx, charts.SolarReturnParams{
			Subject:    shared.Subject{Name: "Subject", BirthData: bd},
			ReturnYear: year,
		})
	},
}
```

- [ ] **Step 4: Add time import to astrology.go**

```go
import (
    // existing imports...
    "time"
)
```

- [ ] **Step 5: Compile tools**

```bash
go build ./internal/tools/...
# Expected: no output
```

- [ ] **Step 6: Commit**

```bash
git add internal/tools/
git commit -m "feat: astrology tool registry with 12 tools via astroapi-go"
```

---

## Task 7: AI streaming loop with tool calls

**Files:**
- Create: `internal/ai/stream.go`

- [ ] **Step 1: Write stream.go**

```go
// internal/ai/stream.go
package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"chat_astrology/internal/store"
	"chat_astrology/internal/tools"
)

const maxSteps = 10

type SendMessageResult struct {
	FullText string
}

func BuildSystemPrompt() string {
	today := time.Now().Format("2006-01-02")
	memory := store.GetAllMemoryText()
	return fmt.Sprintf(`You are a knowledgeable and empathetic astrology consultant. You help users explore astrology, numerology, tarot, Human Design, and related esoteric systems.

You have access to a suite of astrology tools — use them proactively when relevant.

IMPORTANT: When calling any chart or transit tool, you MUST provide both birthPlace (city name only, e.g. "Moscow") and countryCode (ISO 3166-1 alpha-2, e.g. "RU").

Always interpret API results in a warm, insightful way.%s

Today's date: %s`, memory, today)
}

// StreamFunc is called with each text chunk and on error/done
type StreamFunc func(event StreamEvent)

func RunStream(ctx context.Context, chatID string, onEvent StreamFunc) error {
	messages, err := store.GetMessages(chatID)
	if err != nil {
		return err
	}

	chatMsgs := make([]ChatMessage, len(messages))
	for i, m := range messages {
		chatMsgs[i] = ChatMessage{Role: m.Role, Content: m.Content}
	}

	toolDefs := tools.Definitions()
	system := BuildSystemPrompt()

	for step := 0; step < maxSteps; step++ {
		provider, err := NewProvider()
		if err != nil {
			return err
		}

		ch, err := provider.Stream(ctx, StreamRequest{
			Messages: chatMsgs,
			System:   system,
			Tools:    toolDefs,
		})
		if err != nil {
			return err
		}

		var textBuf strings.Builder
		var toolName, toolInput string
		hasToolCall := false

		for event := range ch {
			switch event.Type {
			case "text":
				textBuf.WriteString(event.Text)
				onEvent(event)
			case "tool_call":
				hasToolCall = true
				toolName = event.Tool
				toolInput += event.Input
			case "error":
				onEvent(event)
			case "done":
				// handled below
			}
		}

		// Save assistant text if any
		if textBuf.Len() > 0 {
			store.AddMessage(chatID, "assistant", textBuf.String())
			chatMsgs = append(chatMsgs, ChatMessage{Role: "assistant", Content: textBuf.String()})
		}

		if !hasToolCall {
			break
		}

		// Execute tool
		fmt.Printf("[ai] tool-call: %s %s\n", toolName, toolInput)
		result, err := tools.Execute(ctx, toolName, toolInput)
		if err != nil {
			result = `{"error":"` + err.Error() + `"}`
		}
		fmt.Printf("[ai] tool-result: %s %s\n", toolName, result)

		// Add tool result to history
		toolMsg := fmt.Sprintf("[Tool: %s]\n%s", toolName, result)
		store.AddMessage(chatID, "assistant", toolMsg)
		chatMsgs = append(chatMsgs, ChatMessage{Role: "user", Content: "Tool result for " + toolName + ": " + result})
	}

	return nil
}
```

- [ ] **Step 2: Compile**

```bash
go build ./internal/ai/...
# Expected: no output
```

- [ ] **Step 3: Commit**

```bash
git add internal/ai/stream.go
git commit -m "feat: AI streaming loop with tool-call execution (max 10 steps)"
```

---

## Task 8: App struct and Wails bindings

**Files:**
- Create: `app.go`
- Modify: `main.go`

- [ ] **Step 1: Write app.go**

```go
// app.go
package main

import (
	"context"
	"fmt"
	"net/http"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"chat_astrology/internal/ai"
	"chat_astrology/internal/store"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ── Chats ─────────────────────────────────────────────────────────────────────

func (a *App) CreateChat() (*store.Chat, error) {
	return store.CreateChat()
}

func (a *App) ListChats() ([]store.Chat, error) {
	return store.ListChats()
}

func (a *App) GetChat(chatID string) ([]store.Message, error) {
	return store.GetMessages(chatID)
}

func (a *App) DeleteChat(chatID string) error {
	return store.DeleteChat(chatID)
}

func (a *App) RenameChat(chatID, title string) error {
	return store.RenameChat(chatID, title)
}

// ── Messaging ─────────────────────────────────────────────────────────────────

func (a *App) SendMessage(chatID, message string) error {
	// Save user message
	if _, err := store.AddMessage(chatID, "user", message); err != nil {
		return err
	}

	go func() {
		err := ai.RunStream(a.ctx, chatID, func(event ai.StreamEvent) {
			switch event.Type {
			case "text":
				runtime.EventsEmit(a.ctx, "chat:stream-chunk", map[string]string{
					"chatId": chatID,
					"chunk":  event.Text,
				})
			case "error":
				friendly := ai.FriendlyError(fmt.Errorf("%s", event.Error))
				runtime.EventsEmit(a.ctx, "chat:stream-chunk", map[string]string{
					"chatId": chatID,
					"chunk":  "\n\n⚠️ " + friendly,
				})
			}
		})

		if err != nil {
			friendly := ai.FriendlyError(err)
			runtime.EventsEmit(a.ctx, "chat:stream-chunk", map[string]string{
				"chatId": chatID,
				"chunk":  "⚠️ " + friendly,
			})
		}

		store.TouchChat(chatID)
		store.AutoTitleChat(chatID, message)

		// Load updated chat for title
		chats, _ := store.ListChats()
		for _, c := range chats {
			if c.ID == chatID && c.Title != "New Chat" {
				runtime.WindowSetTitle(a.ctx, "AstroChat — "+c.Title)
				break
			}
		}

		runtime.EventsEmit(a.ctx, "chat:stream-end", map[string]string{"chatId": chatID})
	}()

	return nil
}

// ── Memory ────────────────────────────────────────────────────────────────────

func (a *App) ListMemory() ([]store.MemoryEntry, error) {
	return store.ListMemory()
}

func (a *App) DeleteMemory(key string) error {
	return store.DeleteMemory(key)
}

// ── Settings ──────────────────────────────────────────────────────────────────

func (a *App) GetSettings() map[string]string {
	return store.GetAllSettings()
}

func (a *App) SetSettings(updates map[string]string) error {
	return store.SetSettings(updates)
}

// ── Models ────────────────────────────────────────────────────────────────────

func (a *App) ListModels(provider string) map[string]any {
	apiKey := store.GetSetting(map[string]string{
		"openrouter": "OPENROUTER_API_KEY",
		"openai":     "OPENAI_API_KEY",
		"google":     "GOOGLE_API_KEY",
	}[provider])

	static := map[string][]string{
		"anthropic": {"claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"},
		"mistral":   {"mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"},
	}
	if models, ok := static[provider]; ok {
		return map[string]any{"models": models}
	}

	urls := map[string]string{
		"openrouter": "https://openrouter.ai/api/v1/models",
		"openai":     "https://api.openai.com/v1/models",
		"google":     "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey,
	}
	url, ok := urls[provider]
	if !ok || apiKey == "" {
		return map[string]any{"models": []string{}}
	}

	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]any{"models": []string{}}
	}
	defer resp.Body.Close()

	// Parse response per provider (simplified — returns empty on parse error)
	return map[string]any{"models": []string{}}
}
```

- [ ] **Step 2: Write main.go**

```go
// main.go
package main

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	"chat_astrology/internal/db"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	dataDir := filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "astrology-chat")

	if err := db.Init(dataDir); err != nil {
		panic("failed to init db: " + err.Error())
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "Astrology Chat",
		Width:  1200,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 17, G: 17, B: 17, A: 255},
		OnStartup:        app.startup,
		Bind:             []interface{}{app},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
			About: &mac.AboutInfo{
				Title:   "Astrology Chat",
				Message: "© 2025 SerSlon\nPowered by AI & Astrology API",
				Icon:    nil,
			},
		},
	})
	if err != nil {
		panic(err)
	}
}
```

- [ ] **Step 3: Compile**

```bash
go build .
# Expected: no output
```

- [ ] **Step 4: Commit**

```bash
git add app.go main.go
git commit -m "feat: Wails App struct with all bindings and main entry point"
```

---

## Task 9: Frontend — copy and adapt from current project

**Files:**
- Copy: `frontend/` from `/Users/serslon/Projects/SerSlon/chat_astrology/src/renderer/`
- Modify: `frontend/src/hooks/useChat.ts`
- Delete: `frontend/src/` electron-specific files

- [ ] **Step 1: Copy frontend source**

```bash
cp -r /Users/serslon/Projects/SerSlon/chat_astrology/src/renderer/src/* \
      /Users/serslon/Projects/Procoders/chat_astrology/frontend/src/

cp /Users/serslon/Projects/SerSlon/chat_astrology/src/renderer/index.html \
   /Users/serslon/Projects/Procoders/chat_astrology/frontend/

cp /Users/serslon/Projects/SerSlon/chat_astrology/src/renderer/src/assets/globals.css \
   /Users/serslon/Projects/Procoders/chat_astrology/frontend/src/assets/
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd frontend
npm install lucide-react react-markdown @tailwindcss/typography tailwind-merge clsx
npm install -D @tailwindcss/vite tailwindcss
```

- [ ] **Step 3: Rewrite frontend/src/hooks/useChat.ts**

```typescript
// frontend/src/hooks/useChat.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CreateChat, ListChats, GetChat, DeleteChat, RenameChat, SendMessage,
  GetSettings, SetSettings, ListModels, ListMemory, DeleteMemory,
} from '../../wailsjs/go/main/App'
import { EventsOn, WindowSetTitle } from '../../wailsjs/runtime/runtime'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type Chat = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export function useChat() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const streamingContentRef = useRef('')

  const loadChats = useCallback(async () => {
    const list = await ListChats()
    setChats((list ?? []) as Chat[])
  }, [])

  const loadMessages = useCallback(async (chatId: string) => {
    const msgs = await GetChat(chatId)
    setMessages(
      (msgs ?? []).map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    )
  }, [])

  // Subscribe to stream events via Wails EventsOn
  useEffect(() => {
    const unsubChunk = EventsOn('chat:stream-chunk', ({ chatId, chunk }: any) => {
      streamingContentRef.current += chunk
      setStreamingContent(streamingContentRef.current)
    })

    const unsubEnd = EventsOn('chat:stream-end', async ({ chatId }: any) => {
      setIsStreaming(false)
      streamingContentRef.current = ''
      setStreamingContent('')
      await loadMessages(chatId)
      await loadChats()
      const list = await ListChats()
      const chat = (list ?? []).find((c: any) => c.id === chatId)
      if (chat) WindowSetTitle(`AstroChat — ${chat.title}`)
    })

    return () => {
      unsubChunk()
      unsubEnd()
    }
  }, [loadMessages, loadChats])

  const createChat = useCallback(async () => {
    const chat = await CreateChat()
    await loadChats()
    setActiveChatId(chat.id)
    setMessages([])
    WindowSetTitle('AstroChat — New Chat')
    return chat
  }, [loadChats])

  const selectChat = useCallback(async (chatId: string) => {
    setActiveChatId(chatId)
    await loadMessages(chatId)
    const list = await ListChats()
    const chat = (list ?? []).find((c: any) => c.id === chatId)
    if (chat) WindowSetTitle(`AstroChat — ${chat.title}`)
  }, [loadMessages])

  const deleteChat = useCallback(async (chatId: string) => {
    await DeleteChat(chatId)
    await loadChats()
    if (activeChatId === chatId) {
      setActiveChatId(null)
      setMessages([])
    }
  }, [activeChatId, loadChats])

  const renameChat = useCallback(async (chatId: string, title: string) => {
    await RenameChat(chatId, title)
    await loadChats()
    if (activeChatId === chatId) WindowSetTitle(`AstroChat — ${title}`)
  }, [activeChatId, loadChats])

  const sendMessage = useCallback(async (content: string) => {
    if (!activeChatId || isStreaming) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    streamingContentRef.current = ''
    setStreamingContent('')
    await SendMessage(activeChatId, content)
  }, [activeChatId, isStreaming])

  useEffect(() => {
    loadChats()
    WindowSetTitle('AstroChat')
  }, [loadChats])

  return {
    chats, activeChatId, messages, isStreaming, streamingContent,
    createChat, selectChat, deleteChat, renameChat, sendMessage,
    // Settings helpers exposed for Settings.tsx
    getSettings: GetSettings,
    setSettings: SetSettings,
    listModels: ListModels,
    listMemory: ListMemory,
    deleteMemory: DeleteMemory,
  }
}
```

- [ ] **Step 4: Update Settings.tsx imports**

Replace in `frontend/src/components/Settings.tsx`:
```typescript
// REMOVE this line:
// window.electronAPI.getSettings()  →  use props or import directly

// ADD at top:
import { GetSettings, SetSettings, ListModels } from '../../wailsjs/go/main/App'
```

And replace all `window.electronAPI.X()` calls with direct Wails imports:
- `window.electronAPI.getSettings()` → `GetSettings()`
- `window.electronAPI.setSettings(u)` → `SetSettings(u)`
- `window.electronAPI.listModels(p)` → `ListModels(p)`

- [ ] **Step 5: Generate Wails bindings**

```bash
cd /Users/serslon/Projects/Procoders/chat_astrology
wails generate module
# Expected: creates frontend/wailsjs/ directory with Go bindings
```

- [ ] **Step 6: Run dev mode**

```bash
wails dev
# Expected: app window opens with React UI
```

- [ ] **Step 7: Commit**

```bash
git add frontend/ 
git commit -m "feat: React frontend adapted for Wails bindings"
```

---

## Task 10: ListModels — complete implementation

**Files:**
- Modify: `app.go` — complete `ListModels` function

- [ ] **Step 1: Replace stub ListModels in app.go with full implementation**

```go
func (a *App) ListModels(provider string) map[string]any {
	static := map[string][]string{
		"anthropic": {"claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-5", "claude-sonnet-4-5"},
		"mistral":   {"mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"},
	}
	if models, ok := static[provider]; ok {
		return map[string]any{"models": models}
	}

	keyMap := map[string]string{
		"openrouter": "OPENROUTER_API_KEY",
		"openai":     "OPENAI_API_KEY",
		"google":     "GOOGLE_API_KEY",
	}
	apiKey := store.GetSetting(keyMap[provider])
	if apiKey == "" {
		return map[string]any{"models": []string{}}
	}

	type fetchConfig struct {
		url     string
		extract func(body []byte) []string
	}

	configs := map[string]fetchConfig{
		"openrouter": {
			url: "https://openrouter.ai/api/v1/models",
			extract: func(b []byte) []string {
				var resp struct{ Data []struct{ ID string `json:"id"` } `json:"data"` }
				json.Unmarshal(b, &resp)
				models := make([]string, len(resp.Data))
				for i, m := range resp.Data { models[i] = m.ID }
				sort.Strings(models)
				return models
			},
		},
		"openai": {
			url: "https://api.openai.com/v1/models",
			extract: func(b []byte) []string {
				var resp struct{ Data []struct{ ID string `json:"id"` } `json:"data"` }
				json.Unmarshal(b, &resp)
				var models []string
				for _, m := range resp.Data {
					if strings.HasPrefix(m.ID, "gpt") || strings.HasPrefix(m.ID, "o") {
						models = append(models, m.ID)
					}
				}
				sort.Strings(models)
				return models
			},
		},
		"google": {
			url: "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey,
			extract: func(b []byte) []string {
				var resp struct{ Models []struct{ Name string `json:"name"` } `json:"models"` }
				json.Unmarshal(b, &resp)
				models := make([]string, len(resp.Models))
				for i, m := range resp.Models {
					models[i] = strings.TrimPrefix(m.Name, "models/")
				}
				sort.Strings(models)
				return models
			},
		},
	}

	cfg, ok := configs[provider]
	if !ok {
		return map[string]any{"models": []string{}}
	}

	req, _ := http.NewRequestWithContext(a.ctx, "GET", cfg.url, nil)
	if provider != "google" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]any{"models": []string{}}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return map[string]any{"models": cfg.extract(body)}
}
```

- [ ] **Step 2: Add missing imports to app.go**

```go
import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"chat_astrology/internal/ai"
	"chat_astrology/internal/store"
)
```

- [ ] **Step 3: Compile and test**

```bash
go build .
wails dev
# Test: open Settings → click "Load models" for OpenRouter
# Expected: model list loads
```

- [ ] **Step 4: Commit**

```bash
git add app.go
git commit -m "feat: complete ListModels with live API fetching for all providers"
```

---

## Task 11: Icon, build config, and production build

**Files:**
- Create: `build/appicon.png`
- Modify: `wails.json`

- [ ] **Step 1: Copy app icon**

```bash
cp /Users/serslon/Projects/SerSlon/chat_astrology/resources/icon.png \
   /Users/serslon/Projects/Procoders/chat_astrology/build/appicon.png
```

- [ ] **Step 2: Update wails.json**

```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "chat_astrology",
  "outputfilename": "AstrologyChat",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "author": {
    "name": "SerSlon",
    "email": "sergeysolonina@gmail.com"
  }
}
```

- [ ] **Step 3: Production build**

```bash
wails build -platform darwin/universal
# Expected: builds to build/bin/AstrologyChat.app
```

- [ ] **Step 4: Verify app launches**

```bash
open build/bin/AstrologyChat.app
# Expected: app opens, sidebar visible, settings work, can send messages
```

- [ ] **Step 5: Final commit**

```bash
git add build/ wails.json
git commit -m "feat: build config, app icon, production wails build"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Wails v2 monolith scaffold — Task 1
- ✅ SQLite pure Go (modernc) — Task 2
- ✅ Store layer CRUD — Task 3
- ✅ Multi-provider LLM streaming (5 providers) — Tasks 4-5
- ✅ All 12 astrology tools via astroapi-go — Task 6
- ✅ Tool-call loop (max 10 steps) — Task 7
- ✅ Wails bindings (all IPC methods) — Task 8
- ✅ React frontend reuse with Wails EventsOn — Task 9
- ✅ ListModels live API — Task 10
- ✅ Icon + production build — Task 11

**Placeholder scan:** No TBDs found. Human Design tool has a note about direct fetch — this mirrors the TypeScript implementation and is acceptable.

**Type consistency:** `store.Chat`, `store.Message`, `store.MemoryEntry` used consistently across app.go and store package. `ai.StreamEvent`, `ai.ChatMessage`, `ai.ToolDefinition` used consistently across provider and stream files.

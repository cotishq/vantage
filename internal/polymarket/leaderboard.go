package polymarket

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

const dataAPIBaseURL = "https://data-api.polymarket.com"

type LeaderboardCategory string

const (
	LeaderboardCategoryOverall LeaderboardCategory = "overall"
	LeaderboardCategoryPnl     LeaderboardCategory = "pnl"
	LeaderboardCategoryVolume  LeaderboardCategory = "volume"
)

type LeaderboardTimePeriod string

const (
	LeaderboardTimePeriodAll   LeaderboardTimePeriod = "all"
	LeaderboardTimePeriodDay   LeaderboardTimePeriod = "day"
	LeaderboardTimePeriodWeek  LeaderboardTimePeriod = "week"
	LeaderboardTimePeriodMonth LeaderboardTimePeriod = "month"
)

type LeaderboardOrderBy string

const (
	LeaderboardOrderByPnl LeaderboardOrderBy = "pnl"
	LeaderboardOrderByVol LeaderboardOrderBy = "vol"
)

type LeaderboardEntry struct {
	Rank          int     `json:"rank"`
	ProxyWallet   string  `json:"proxyWallet"`
	UserName      string  `json:"userName"`
	Vol           float64 `json:"vol"`
	Pnl           float64 `json:"pnl"`
	ProfileImage  string  `json:"profileImage"`
	XUsername     string  `json:"xUsername"`
	VerifiedBadge bool    `json:"verifiedBadge"`
}

func (e *LeaderboardEntry) UnmarshalJSON(data []byte) error {
	var raw struct {
		Rank          json.RawMessage `json:"rank"`
		ProxyWallet   string          `json:"proxyWallet"`
		UserName      string          `json:"userName"`
		Vol           json.RawMessage `json:"vol"`
		Pnl           json.RawMessage `json:"pnl"`
		ProfileImage  string          `json:"profileImage"`
		XUsername     string          `json:"xUsername"`
		VerifiedBadge bool            `json:"verifiedBadge"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	rank, err := parseJSONInt(raw.Rank, "rank")
	if err != nil {
		return err
	}
	vol, err := parseJSONFloat(raw.Vol, "vol")
	if err != nil {
		return err
	}
	pnl, err := parseJSONFloat(raw.Pnl, "pnl")
	if err != nil {
		return err
	}

	e.Rank = rank
	e.ProxyWallet = raw.ProxyWallet
	e.UserName = raw.UserName
	e.Vol = vol
	e.Pnl = pnl
	e.ProfileImage = raw.ProfileImage
	e.XUsername = raw.XUsername
	e.VerifiedBadge = raw.VerifiedBadge
	return nil
}

type LeaderboardParams struct {
	Category   LeaderboardCategory
	TimePeriod LeaderboardTimePeriod
	OrderBy    LeaderboardOrderBy
	Limit      int
	Offset     int
}

func (c *Client) GetLeaderboard(p LeaderboardParams) ([]LeaderboardEntry, error) {
	params := url.Values{}
	if p.Category != "" {
		params.Set("category", string(p.Category))
	}
	if p.TimePeriod != "" {
		params.Set("timePeriod", string(p.TimePeriod))
	}
	if p.OrderBy != "" {
		params.Set("orderBy", string(p.OrderBy))
	}
	if p.Limit > 0 {
		params.Set("limit", strconv.Itoa(p.Limit))
	}
	if p.Offset > 0 {
		params.Set("offset", strconv.Itoa(p.Offset))
	}

	var entries []LeaderboardEntry
	if err := c.get(dataAPIBaseURL, "/v1/leaderboard", params, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func parseJSONInt(raw json.RawMessage, field string) (int, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, nil
	}

	var value int
	if err := json.Unmarshal(raw, &value); err == nil {
		return value, nil
	}

	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return 0, fmt.Errorf("decode %s: %w", field, err)
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return 0, nil
	}

	value, err := strconv.Atoi(text)
	if err != nil {
		return 0, fmt.Errorf("decode %s %q: %w", field, text, err)
	}
	return value, nil
}

func parseJSONFloat(raw json.RawMessage, field string) (float64, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, nil
	}

	var value float64
	if err := json.Unmarshal(raw, &value); err == nil {
		return value, nil
	}

	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return 0, fmt.Errorf("decode %s: %w", field, err)
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return 0, nil
	}

	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0, fmt.Errorf("decode %s %q: %w", field, text, err)
	}
	return value, nil
}

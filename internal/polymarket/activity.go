package polymarket

import (
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

type Position struct {
	ProxyWallet  string  `json:"proxyWallet"`
	Asset        string  `json:"asset"`
	ConditionID  string  `json:"conditionId"`
	Size         float64 `json:"size"`
	AvgPrice     float64 `json:"avgPrice"`
	InitialValue float64 `json:"initialValue"`
	CurrentValue float64 `json:"currentValue"`
	CashPnl      float64 `json:"cashPnl"`
	PercentPnl   float64 `json:"percentPnl"`
	TotalBought  float64 `json:"totalBought"`
	RealizedPnl  float64 `json:"realizedPnl"`
	CurPrice     float64 `json:"curPrice"`
	Redeemable   bool    `json:"redeemable"`
	Title        string  `json:"title"`
	Slug         string  `json:"slug"`
	Outcome      string  `json:"outcome"`
	OutcomeIndex int     `json:"outcomeIndex"`
}

func (p *Position) UnmarshalJSON(data []byte) error {
	var raw struct {
		ProxyWallet  string          `json:"proxyWallet"`
		Asset        string          `json:"asset"`
		ConditionID  string          `json:"conditionId"`
		Size         json.RawMessage `json:"size"`
		AvgPrice     json.RawMessage `json:"avgPrice"`
		InitialValue json.RawMessage `json:"initialValue"`
		CurrentValue json.RawMessage `json:"currentValue"`
		CashPnl      json.RawMessage `json:"cashPnl"`
		PercentPnl   json.RawMessage `json:"percentPnl"`
		TotalBought  json.RawMessage `json:"totalBought"`
		RealizedPnl  json.RawMessage `json:"realizedPnl"`
		CurPrice     json.RawMessage `json:"curPrice"`
		Redeemable   bool            `json:"redeemable"`
		Title        string          `json:"title"`
		Slug         string          `json:"slug"`
		Outcome      string          `json:"outcome"`
		OutcomeIndex json.RawMessage `json:"outcomeIndex"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	size, err := parseJSONFloat(raw.Size, "size")
	if err != nil {
		return err
	}
	avgPrice, err := parseJSONFloat(raw.AvgPrice, "avgPrice")
	if err != nil {
		return err
	}
	initialValue, err := parseJSONFloat(raw.InitialValue, "initialValue")
	if err != nil {
		return err
	}
	currentValue, err := parseJSONFloat(raw.CurrentValue, "currentValue")
	if err != nil {
		return err
	}
	cashPnl, err := parseJSONFloat(raw.CashPnl, "cashPnl")
	if err != nil {
		return err
	}
	percentPnl, err := parseJSONFloat(raw.PercentPnl, "percentPnl")
	if err != nil {
		return err
	}
	totalBought, err := parseJSONFloat(raw.TotalBought, "totalBought")
	if err != nil {
		return err
	}
	realizedPnl, err := parseJSONFloat(raw.RealizedPnl, "realizedPnl")
	if err != nil {
		return err
	}
	curPrice, err := parseJSONFloat(raw.CurPrice, "curPrice")
	if err != nil {
		return err
	}
	outcomeIndex, err := parseJSONInt(raw.OutcomeIndex, "outcomeIndex")
	if err != nil {
		return err
	}

	p.ProxyWallet = raw.ProxyWallet
	p.Asset = raw.Asset
	p.ConditionID = raw.ConditionID
	p.Size = size
	p.AvgPrice = avgPrice
	p.InitialValue = initialValue
	p.CurrentValue = currentValue
	p.CashPnl = cashPnl
	p.PercentPnl = percentPnl
	p.TotalBought = totalBought
	p.RealizedPnl = realizedPnl
	p.CurPrice = curPrice
	p.Redeemable = raw.Redeemable
	p.Title = raw.Title
	p.Slug = raw.Slug
	p.Outcome = raw.Outcome
	p.OutcomeIndex = outcomeIndex
	return nil
}

type Activity struct {
	ProxyWallet  string  `json:"proxyWallet"`
	Side         string  `json:"side"`
	Asset        string  `json:"asset"`
	ConditionID  string  `json:"conditionId"`
	Size         float64 `json:"size"`
	Price        float64 `json:"price"`
	Timestamp    int64   `json:"timestamp"`
	Title        string  `json:"title"`
	Slug         string  `json:"slug"`
	Outcome      string  `json:"outcome"`
	OutcomeIndex int     `json:"outcomeIndex"`
	Type         string  `json:"type"`
}

func (a *Activity) UnmarshalJSON(data []byte) error {
	var raw struct {
		ProxyWallet  string          `json:"proxyWallet"`
		Side         string          `json:"side"`
		Asset        string          `json:"asset"`
		ConditionID  string          `json:"conditionId"`
		Size         json.RawMessage `json:"size"`
		Price        json.RawMessage `json:"price"`
		Timestamp    json.RawMessage `json:"timestamp"`
		Title        string          `json:"title"`
		Slug         string          `json:"slug"`
		Outcome      string          `json:"outcome"`
		OutcomeIndex json.RawMessage `json:"outcomeIndex"`
		Type         string          `json:"type"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	size, err := parseJSONFloat(raw.Size, "size")
	if err != nil {
		return err
	}
	price, err := parseJSONFloat(raw.Price, "price")
	if err != nil {
		return err
	}
	timestamp, err := parseJSONInt(raw.Timestamp, "timestamp")
	if err != nil {
		return err
	}
	outcomeIndex, err := parseJSONInt(raw.OutcomeIndex, "outcomeIndex")
	if err != nil {
		return err
	}

	a.ProxyWallet = raw.ProxyWallet
	a.Side = raw.Side
	a.Asset = raw.Asset
	a.ConditionID = raw.ConditionID
	a.Size = size
	a.Price = price
	a.Timestamp = int64(timestamp)
	a.Title = raw.Title
	a.Slug = raw.Slug
	a.Outcome = raw.Outcome
	a.OutcomeIndex = outcomeIndex
	a.Type = raw.Type
	return nil
}

func (c *Client) GetPositions(wallet string, limit, offset int) ([]Position, error) {
	params := url.Values{}
	params.Set("user", wallet)
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		params.Set("offset", strconv.Itoa(offset))
	}

	var positions []Position
	if err := c.get(dataAPIBaseURL, "/positions", params, &positions); err != nil {
		return nil, err
	}
	return positions, nil
}

func (c *Client) GetActivity(wallet string, types []string, limit, offset int) ([]Activity, error) {
	params := url.Values{}
	params.Set("user", wallet)
	if len(types) > 0 {
		params.Set("type", strings.Join(types, ","))
	}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		params.Set("offset", strconv.Itoa(offset))
	}

	var activity []Activity
	if err := c.get(dataAPIBaseURL, "/activity", params, &activity); err != nil {
		return nil, err
	}
	return activity, nil
}

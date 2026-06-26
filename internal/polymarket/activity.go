package polymarket

import (
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

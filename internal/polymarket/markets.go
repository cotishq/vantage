package polymarket

import (
	"log"
	"net/url"
	"strconv"
)

type Event struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
}

type Market struct {
	ID               string  `json:"id"`
	Question         string  `json:"question"`
	ConditionID      string  `json:"conditionId"`
	Slug             string  `json:"slug"`
	TwitterCardImage string  `json:"twitterCardImage"`
	EndDate          string  `json:"endDate"`
	Category         string  `json:"category"`
	Liquidity        string  `json:"liquidity"`
	Image            string  `json:"image"`
	Icon             string  `json:"icon"`
	Outcomes         string  `json:"outcomes"`      // e.g. "[\"Yes\",\"No\"]"
	OutcomePrices    string  `json:"outcomePrices"` // e.g. "[\"0.18\",\"0.82\"]"
	Volume           string  `json:"volume"`
	Active           bool    `json:"active"`
	Closed           bool    `json:"closed"`
	Volume24hr       float64 `json:"volume24hr,omitempty"`
	Events           []Event `json:"events,omitempty"`
}

func (c *Client) GetMarketsByConditionIDs(ids []string) ([]Market, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	params := url.Values{}
	for _, id := range ids {
		params.Add("condition_ids", id)
	}
	var markets []Market
	err := c.get("https://gamma-api.polymarket.com", "/markets", params, &markets)
	if err != nil {
		return nil, err
	}

	foundIDs := make(map[string]bool)
	for _, m := range markets {
		foundIDs[m.ConditionID] = true
	}

	var missingIDs []string
	for _, id := range ids {
		if !foundIDs[id] {
			missingIDs = append(missingIDs, id)
		}
	}

	if len(missingIDs) > 0 {
		closedParams := url.Values{}
		for _, id := range missingIDs {
			closedParams.Add("condition_ids", id)
		}
		closedParams.Set("closed", "true")

		var closedMarkets []Market
		err := c.get("https://gamma-api.polymarket.com", "/markets", closedParams, &closedMarkets)
		if err == nil {
			markets = append(markets, closedMarkets...)
		} else {
			log.Printf("warning: fetching closed markets failed: %v", err)
		}
	}

	return markets, nil
}

func (c *Client) GetTopActiveMarkets(limit int) ([]Market, error) {
	params := url.Values{}
	params.Set("closed", "false")
	params.Set("order", "volume24hr")
	params.Set("ascending", "false")
	params.Set("limit", strconv.Itoa(limit))

	var markets []Market
	err := c.get("https://gamma-api.polymarket.com", "/markets", params, &markets)
	if err != nil {
		return nil, err
	}
	return markets, nil
}

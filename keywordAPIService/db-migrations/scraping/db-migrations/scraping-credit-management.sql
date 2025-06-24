CREATE TABLE api_credits (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    balance_remaining INTEGER NOT NULL,
    credits_remaining INTEGER NOT NULL,
    currency TEXT NOT NULL,
    is_active BOOLEAN
);

CREATE TABLE api_credit_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    transaction_type TEXT,
    description TEXT,
    reference_id TEXT,
    created_at TIMESTAMPTZ,
    transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit')),
    status TEXT CHECK (status IN ('pending', 'completed', 'failed')),
);

CREATE TABLE scrape_jobs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    url TEXT,
    status TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    credits_used INTEGER NOT NULL,
    result_id TEXT
);
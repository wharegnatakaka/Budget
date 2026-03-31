class PocketsmithSyncService
  API_BASE   = "https://api.pocketsmith.com/v2"
  MAX_RETRY  = 3

  def initialize
    @api_key = ENV.fetch("POCKETSMITH_API_KEY")
    @client  = HTTP.headers(
      "X-Developer-Key" => @api_key,
      "Accept"          => "application/json"
    )
    @user_id = get("#{API_BASE}/me")["id"]
  end

  def sync_transactions(days_back: 30)
    start_date = days_back.days.ago.to_date
    imported = 0
    skipped = 0

    account_cache = {}

    each_transaction(start_date: start_date) do |raw_txn|
      if Transaction.exists?(ps_id: raw_txn["id"].to_s)
        skipped += 1
      else
        raw_account = raw_txn["transaction_account"]
        account = account_cache[raw_account["id"]] ||= PocketsmithAccount.upsert_from_raw(raw_account)
        Transaction.from_pocketsmith(raw_txn, pocketsmith_account: account).save!
        imported += 1
      end
    end

    log "sync complete: imported=#{imported} skipped=#{skipped}"
    notify("Pocketsmith Sync Complete", "Synced #{imported} transactions (#{skipped} skipped)", priority: 2)
    categorisation = ClaudeCategorizationService.new
    categorisation.process_batch! while Transaction.unprocessed.not_transfers.exists?
  rescue => e
    log "sync failed: #{e.message}"
    notify("Pocketsmith Sync Failed", e.message, priority: 3)
    raise
  end

  def snapshot_savings_accounts
    SavingsAccount.includes(:pocketsmith_account).each do |account|
      next unless account.pocketsmith_account

      balance = fetch_account_balance(account.pocketsmith_account.ps_id)
      next unless balance

      SavingsSnapshot.find_or_create_by(savings_account: account, date: Date.today) do |s|
        s.balance = balance
      end
    end
  end

  def snapshot_mortgages
    Mortgage.includes(:pocketsmith_account).each do |mortgage|
      next unless mortgage.pocketsmith_account

      balance = fetch_account_balance(mortgage.pocketsmith_account.ps_id)
      next unless balance

      MortgageSnapshot.find_or_create_by(mortgage: mortgage, date: Date.today) do |s|
        s.balance = balance.abs
      end
    end
  end

  private

  def each_transaction(start_date:, &block)
    url = "#{API_BASE}/users/#{@user_id}/transactions"
    params = { start_date: start_date.iso8601, end_date: Date.today.iso8601, per_page: 1000 }

    loop do
      response = get_response(url, params)
      response.parse.each(&block)

      next_url = next_page_url(response)
      break unless next_url

      url    = next_url
      params = {}
    end
  rescue => e
    log "failed to fetch transactions: #{e.message}"
  end

  def next_page_url(response)
    link_header = response.headers["Link"]
    return unless link_header

    LinkHeader.parse(link_header).links
      .find { |l| l["rel"] == "next" }
      &.href
  end

  def fetch_account_balance(ps_account_id)
    get("#{API_BASE}/transaction_accounts/#{ps_account_id}")&.dig("current_balance")
  rescue => e
    log "failed to fetch account #{ps_account_id}: #{e.message}"
    nil
  end

  def get_response(url, params = {})
    attempts = 0
    begin
      attempts += 1
      @client.get(url, params: params)
    rescue HTTP::Error => e
      retry if attempts < MAX_RETRY
      raise
    end
  end

  def get(url, params = {})
    get_response(url, params).parse
  end

  def log(msg)
    Rails.logger.info("[#{Time.now}] PocketsmithSync: #{msg}")
  end

  def notify(title, body, priority: 3)
    ntfy_url = ENV["NTFY_URL"]
    return unless ntfy_url

    HTTP.headers(
      "X-Title"    => title,
      "X-Priority" => priority.to_s
    ).post(ntfy_url, body: body)
  rescue => e
    log "ntfy notification failed: #{e.message}"
  end
end

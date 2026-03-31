class ClaudeCategorizationService
  BATCH_SIZE = 20
  MODEL      = "claude-haiku-4-5-20251001"

  # PS IDs for accounts whose transactions must land in a specific budget category.
  # Looked up by ps_id at runtime to get the Rails foreign key used on transactions.
  ACCOUNT_PS_ID_CONSTRAINTS = {
    "2443009" => "Outgoing",
    "2443000" => "Groceries",
    "2443021" => "Eating Out",
  }.freeze

  SYSTEM_PROMPT = <<~PROMPT
    You are a personal finance analyst for a New Zealand household.
    Categorise each transaction into one of the provided categories.
    For is_transfer, flag true if the transaction looks like a movement of money between accounts rather than real spending.

    Each transaction includes a pocketsmith_account_id. Some accounts are dedicated to specific budget areas:
    - Account 2443009 is the Outgoing account — all transactions from here are fixed recurring expenses
    - Account 2443000 is the Groceries account — all transactions from here are grocery purchases
    - Account 2443021 is the Eating Out account — all transactions from here are dining/food purchases
    - Account 4873170 and 2242603 are general spending accounts - most transactions from these accounts are discretionary spending, but sometimes groceries or eating-out expenses can be misposted here, so check the category carefully.
    - Account 2443015 is a short term savings acount - most transactions here are spending on home renevations
    

    Category guidance:
    - Insurance: any insurance premium — house, contents, car, health, life
    - Subscriptions: recurring software, media, or service subscriptions (streaming, apps, memberships)
    - Utilities: power, gas, water, phone, internet bills, cloud hosting services
    - Charity: charitable giving and donations
    - Gym & Fitness: gym memberships, fitness classes, sports clubs
    - Rates: council rates
    - Mortgage: home loan repayments
    - Misc fixed expenses: any other regular fixed bill not covered above
    - Supermarket: supermarket and grocery store purchases
    - Restaurants: sit-down restaurant meals
    - Takeaways: fast food and takeaway orders
    - Food Delivery: food ordered via delivery apps (UberEats, Deliveroo etc.)
    - Clothing: apparel and footwear
    - Entertainment: movies, events, games, hobbies
    - Cafes & bakery: cafes, coffee shops, and bakeries
    - Bars & pubs: bars, pubs, and alcohol purchases
    - Home Improvement: renovations and upgrades
    - Appliances & Furniture: white goods, appliances, furniture, and homewares
    - Repairs & Maintenance: tradespeople, parts, and general home repairs
    - Travel: flights, accommodation, and transport for trips
    - Activities & Experiences: recreational activities, experiences, days out, and adventure spending
    - Gifts: gifts and presents for others
    - Personal care: haircuts, beauty, grooming, health products
    - One-off cost: significant one-time purchases funded from short-term savings (not day-to-day spending)
    - Misc: use this when confidence is below 0.7, or when the transaction doesn't clearly match any other category
    - Short Term Transfer: transfers to short-term savings goals
    - KiwiSaver: KiwiSaver contributions
    - Investment: shares, managed funds, and other long-term investments

    If you are unsure of the category and confidence is below 0.7, always use Misc rather than guessing.
  PROMPT

  TOOL = {
    name: "categorise_transactions",
    description: "Categorise a batch of transactions",
    input_schema: {
      type: "object",
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "category", "confidence", "reasoning", "is_transfer"],
            properties: {
              id:          { type: "string" },
              category:    { type: ["string", "null"], description: "Matching category name, or null if none fits" },
              confidence:  { type: "number", description: "0.0–1.0" },
              reasoning:   { type: "string", description: "Brief one-line explanation" },
              is_transfer: { type: "boolean" }
            }
          }
        }
      }
    }
  }.freeze

  def initialize
    @client     = Anthropic::Client.new
    @categories = TransactionCategory.pluck(:name)
    @category_budget_map = TransactionCategory
      .joins(:budget_category)
      .pluck("transaction_categories.name", "budget_categories.name")
      .to_h
    # Map Rails pocketsmith_account_id → required budget category name
    @account_constraints = PocketsmithAccount
      .where(ps_id: ACCOUNT_PS_ID_CONSTRAINTS.keys)
      .pluck(:id, :ps_id)
      .to_h { |rails_id, ps_id| [rails_id, ACCOUNT_PS_ID_CONSTRAINTS[ps_id]] }
  end

  def process_batch!
    unprocessed = Transaction.unprocessed.not_transfers.limit(BATCH_SIZE).to_a
    return if unprocessed.empty?

    results = call_claude(unprocessed)
    apply_results(unprocessed, results)
  rescue => e
    Rails.logger.error("[#{Time.now}] ClaudeCategorization failed: #{e.message}")
    Transaction.where(id: unprocessed.map(&:id)).update_all(processing_status: "failed")
  end

  private

  def call_claude(transactions)
    payload = transactions.map do |t|
      {
        id:                    t.id.to_s,
        date:                  t.date,
        payee:                 t.payee,
        original_payee:        t.original_payee,
        memo:                  t.memo,
        amount:                t.amount,
        ps_category:           t.ps_category,
        pocketsmith_account_id: t.pocketsmith_account_id
      }.compact
    end

    response = @client.messages.create(
      model:       MODEL,
      max_tokens:  2048,
      system:      "#{SYSTEM_PROMPT}\n\nAvailable categories: #{@categories.join(', ')}",
      tools:       [TOOL],
      tool_choice: { type: "tool", name: "categorise_transactions" },
      messages:    [{ role: "user", content: payload.to_json }]
    )

    input = response.content.first.input
    input[:results] || input["results"] || []
  end

  def apply_results(transactions, results)
    result_map = results.index_by { |r| r[:id] }

    transactions.each do |txn|
      result = result_map[txn.id.to_s]
      next unless result

      category_name = enforce_account_constraint(txn, result[:category])
      txn.update!(
        haiku_category:       result[:category],
        haiku_confidence:     result[:confidence],
        haiku_reasoning:      result[:reasoning],
        haiku_is_transfer:    result[:is_transfer],
        transaction_category: TransactionCategory.find_by(name: category_name),
        processing_status:    "processed"
      )
    end
  end

  # If the transaction's account has a constraint, ensure the classified category
  # belongs to the required budget category. If not, fall back to the catch-all
  # for that budget category.
  def enforce_account_constraint(txn, category_name)
    required_budget = @account_constraints[txn.pocketsmith_account_id]
    return category_name unless required_budget

    actual_budget = @category_budget_map[category_name]
    return category_name if actual_budget == required_budget

    # Override: find a matching subcategory or fall back to the catch-all
    @categories.find { |c| @category_budget_map[c] == required_budget && c == required_budget } || category_name
  end
end

sam       = Person.find_or_create_by!(name: "Sam")       { |p| p.fortnightly_income = 5571.98 }
ish       = Person.find_or_create_by!(name: "Ish")       { |p| p.fortnightly_income = 1295.99 }
household = Person.find_or_create_by!(name: "Household") { |p| p.fortnightly_income = nil }

{
  sam => %w[General Cash Buffer],
  ish => ["Spending", "Outgoing", "fortnightly", "short term savings", "Long term savings"],
  household => ["Incoming", "Eating out", "Groceries", "Adventure!", "Home Loan Paying",
                "Home Loan", "DEPOSIT", "Joint Notice Savings", "Platinum Visa"]
}.each do |person, names|
  names.each do |name|
    PocketsmithAccount.where(name: name).update_all(person_id: person.id)
  end
end

sam_income   = Person.find_by!(name: "Sam").fortnightly_income
ish_income   = Person.find_by!(name: "Ish").fortnightly_income
total_income = sam_income + ish_income
sam_pct      = (sam_income / total_income * 100).round(4)
ish_pct      = (ish_income / total_income * 100).round(4)

[
  { name: "Outgoing",           section: "outgoing",  position:  0, fortnightly_amount: 2541.25, sam_amount: 2061.71, ish_amount:  479.53, sam_pct: sam_pct, ish_pct: ish_pct },
  { name: "Groceries",          section: "spending",  position:  1, fortnightly_amount:  400.00, sam_amount:  350.00, ish_amount:   50.00 },
  { name: "Eating Out",         section: "spending",  position:  2, fortnightly_amount:  110.00, sam_amount:  110.00, ish_amount:    0.00 },
  { name: "House",              section: "spending",  position:  3, fortnightly_amount: 1000.00, sam_amount: 1000.00, ish_amount:    0.00 },
  { name: "Adventure",          section: "spending",  position:  4, fortnightly_amount:  350.00, sam_amount:  350.00, ish_amount:    0.00 },
  { name: "Spending",           section: "spending",  position: 99, fortnightly_amount:  416.72, sam_amount:  200.27, ish_amount:  216.46 },
  { name: "Short Term Savings", section: "saving",    position:  1, fortnightly_amount:  700.00, sam_amount:  500.00, ish_amount:  200.00 },
  { name: "Long Term Savings",  section: "saving",    position:  2, fortnightly_amount: 1350.00, sam_amount: 1000.00, ish_amount:  350.00 },
].each do |attrs|
  cat = BudgetCategory.find_or_create_by!(name: attrs[:name]) { |c| c.fortnightly_amount = attrs[:fortnightly_amount] }
  cat.update_columns(
    section:            attrs[:section],
    sam_amount:         attrs[:sam_amount],
    ish_amount:         attrs[:ish_amount],
    sam_pct:            attrs[:sam_pct],
    ish_pct:            attrs[:ish_pct],
    position:           attrs[:position],
    fortnightly_amount: attrs[:fortnightly_amount]
  )
end

transaction_category_map = {
  "Outgoing"           => ["Insurance", "Subscriptions", "Utilities", "Charity", "Gym & Fitness", "Rates", "Mortgage", "Misc fixed expenses"],
  "Groceries"          => ["Supermarket"],
  "Eating Out"         => ["Restaurants", "Takeaways", "Food Delivery"],
  "House"              => ["Home Improvement", "Appliances & Furniture", "Repairs & Maintenance"],
  "Adventure"          => ["Travel", "Activities & Experiences"],
  "Spending"           => ["Clothing", "Entertainment", "Cafes & bakery", "Bars & pubs", "Gifts", "Personal care", "Misc"],
  "Short Term Savings" => ["Short Term Transfer", "One-off cost"],
  "Long Term Savings"  => ["KiwiSaver", "Investment"],
}

# Remove subcategories that are no longer in the list (nullifies transactions — they'll be re-classified)
transaction_category_map.each do |budget_cat_name, subcats|
  budget_cat = BudgetCategory.find_by!(name: budget_cat_name)
  TransactionCategory.where(budget_category: budget_cat).where.not(name: subcats + [budget_cat_name]).destroy_all
end

# Create any new subcategories
transaction_category_map.each do |budget_cat_name, subcats|
  budget_cat = BudgetCategory.find_by!(name: budget_cat_name)
  subcats.each do |name|
    TransactionCategory.find_or_create_by!(name: name) { |tc| tc.budget_category = budget_cat }
  end
end

fixed_expenses = [
  { position:  1, name: "Fixed Mortgage",           fortnightly_amount: 1991.99 },
  { position:  2, name: "Floating Mortgage",         fortnightly_amount:   96.13 },
  { position:  3, name: "Rates",                     fortnightly_amount:  366.00 },
  { position:  4, name: "House/Contents Insurance",  fortnightly_amount:  246.87 },
  { position:  5, name: "Third Party Car Insurance", fortnightly_amount:   10.00 },
  { position:  6, name: "Studio Rent",               fortnightly_amount: -600.00 },
  { position:  7, name: "Internet",                  fortnightly_amount:   39.00 },
  { position:  8, name: "Power",                     fortnightly_amount:   75.00 },
  { position:  9, name: "Phone",                     fortnightly_amount:   43.00 },
  { position: 10, name: "Resident Parking",          fortnightly_amount:    7.69 },
  { position: 11, name: "Health Insurance",          fortnightly_amount:   29.69 },
  { position: 12, name: "Vetty",                     fortnightly_amount:   23.00 },
  { position: 13, name: "Neon",                      fortnightly_amount:   12.00 },
  { position: 14, name: "Tidal",                     fortnightly_amount:   13.00 },
  { position: 15, name: "Les Mills",                 fortnightly_amount:   55.80 },
  { position: 16, name: "Climbing",                  fortnightly_amount:    0.00 },
  { position: 17, name: "Family For Every Child",    fortnightly_amount:   25.00 },
  { position: 18, name: "Kids Can",                  fortnightly_amount:   15.00 },
  { position: 19, name: "Greenpeace",                fortnightly_amount:   10.00 },
  { position: 20, name: "UNHCR",                     fortnightly_amount:   12.50 },
  { position: 21, name: "PocketSmith",               fortnightly_amount:    7.50 },
  { position: 22, name: "The Spinoff",               fortnightly_amount:    7.50 },
  { position: 23, name: "WPA",                       fortnightly_amount:    9.23 },
  { position: 24, name: "Massey Library",            fortnightly_amount:    3.85 },
  { position: 25, name: "Libro",                     fortnightly_amount:   10.00 },
  { position: 26, name: "Snapper",                   fortnightly_amount:    0.00 },
  { position: 27, name: "Hetzner",                   fortnightly_amount:   20.00 },
  { position: 28, name: "Proton",                    fortnightly_amount:    8.50 },
  { position: 29, name: "Domains",                   fortnightly_amount:    3.00 },
]

fixed_expenses.each do |attrs|
  FixedExpense.find_or_create_by!(name: attrs[:name]) do |e|
    e.fortnightly_amount = attrs[:fortnightly_amount]
    e.position           = attrs[:position]
  end
end

BudgetPeriod.generate_from_anchor(Date.new(2025, 2, 26))

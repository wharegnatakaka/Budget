module Api
  module V1
    class DashboardController < BaseController
      def show
        period = if params[:period_id]
          BudgetPeriod.find(params[:period_id])
        else
          BudgetPeriod.current.first || BudgetPeriod.recent.first
        end

        category_totals = Transaction
          .not_transfers
          .where(date: period.start_date..period.end_date)
          .where.not(transaction_category_id: nil)
          .joins(:transaction_category)
          .group("transaction_categories.budget_category_id")
          .sum(:amount)

        categories = BudgetCategory.all.map do |cat|
          {
            id:                 cat.id,
            name:               cat.name,
            fortnightly_amount: cat.fortnightly_amount,
            sam_amount:         cat.sam_amount,
            ish_amount:         cat.ish_amount,
            sam_pct:            cat.sam_pct,
            ish_pct:            cat.ish_pct,
            position:           cat.position,
            section:            cat.section,
            spent:              category_totals[cat.id]&.abs || 0
          }
        end

        sam = Person.find_by(name: "Sam")
        ish = Person.find_by(name: "Ish")

        tracked_ps_ids    = %w[2443000 2443021 2242603 4873170]
        tracked_accounts  = PocketsmithAccount.where(ps_id: tracked_ps_ids).index_by(&:ps_id)
        spending_accounts = tracked_accounts.slice("2242603", "4873170")

        account_spending_raw = Transaction
          .not_transfers
          .debits
          .where(date: period.start_date..period.end_date)
          .where(pocketsmith_account_id: spending_accounts.values.map(&:id))
          .group(:pocketsmith_account_id)
          .sum(:amount)
        general_id  = tracked_accounts["2242603"]&.id
        spending_id = tracked_accounts["4873170"]&.id

        # Pending (unprocessed) transaction counts per PS account, for donut indicators
        pending_by_rails_id = Transaction
          .unprocessed
          .not_transfers
          .where(date: period.start_date..period.end_date)
          .where(pocketsmith_account_id: tracked_accounts.values.map(&:id))
          .group(:pocketsmith_account_id)
          .count
        pending_by_ps_account = tracked_accounts.transform_values { |a| pending_by_rails_id[a.id] || 0 }

        prev_period = BudgetPeriod.where("end_date < ?", period.start_date).order(end_date: :desc).first
        next_period = BudgetPeriod.where("start_date > ?", period.end_date).order(start_date: :asc).first

        render json: {
          period: {
            id:         period.id,
            start_date: period.start_date,
            end_date:   period.end_date,
            prev_id:    prev_period&.id,
            next_id:    next_period&.id
          },
          salaries: {
            sam:   sam&.fortnightly_income || 0,
            ish:   ish&.fortnightly_income || 0,
            total: (sam&.fortnightly_income || 0) + (ish&.fortnightly_income || 0)
          },
          fixed_expenses:       FixedExpense.all,
          fixed_expenses_total: FixedExpense.sum(:fortnightly_amount),
          categories:           categories,
          transaction_status: Transaction.group(:processing_status).count.then { |c|
            pending = Transaction.where(processing_status: 'imported')
              .where("haiku_is_transfer = false OR haiku_is_transfer IS NULL")
              .where("is_transfer = false OR is_transfer IS NULL")
              .count
            transfers = (c['imported'] || 0) - pending
            { processed: c['processed'] || 0, transfers: transfers, pending: pending, failed: c['failed'] || 0 }
          },
          account_spending: {
            general:  (account_spending_raw[general_id]&.abs  || 0),
            spending: (account_spending_raw[spending_id]&.abs || 0),
          },
          pending_by_ps_account: pending_by_ps_account,
          savings_accounts:     PocketsmithAccount
            .joins(:person)
            .where(people: { name: ["Sam", "Ish", "Household"] })
            .where.not(current_balance: nil)
            .select(:id, :name, :current_balance, :account_type)
        }
      end
    end
  end
end

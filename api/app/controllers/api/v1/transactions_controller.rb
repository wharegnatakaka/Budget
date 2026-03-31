module Api
  module V1
    class TransactionsController < BaseController
      def index
        page    = (params[:page] || 1).to_i
        per     = (params[:per_page] || 50).to_i
        offset  = (page - 1) * per

        scope = Transaction.not_transfers.order(date: :desc)
        scope = scope.where(processing_status: params[:status]) if params[:status]
        scope = scope.joins(:transaction_category).where(transaction_categories: { budget_category_id: params[:budget_category_id] }) if params[:budget_category_id]
        if params[:ps_account_id]
          account = PocketsmithAccount.find_by(ps_id: params[:ps_account_id])
          scope = scope.where(pocketsmith_account_id: account&.id)
          if params[:own_budget_category_id]
            own_cat_ids = TransactionCategory.where(budget_category_id: params[:own_budget_category_id]).pluck(:id)
            scope = scope.where(transaction_category_id: own_cat_ids + [nil])
          end
        end
        scope = scope.where(date: params[:start_date]..) if params[:start_date]
        scope = scope.where(date: ..params[:end_date])   if params[:end_date]

        total = scope.count
        rows  = scope.limit(per).offset(offset).includes(transaction_category: :budget_category).map do |t|
          t.as_json.merge(
            transaction_category_name: t.transaction_category&.name,
            budget_category_name:      t.transaction_category&.budget_category&.name
          )
        end

        render json: { data: rows, meta: { total: total, page: page, per_page: per } }
      end

      def show
        render json: transaction
      end

      def update
        if transaction.update(update_params)
          render json: transaction
        else
          render json: { errors: transaction.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def reprocess
        transaction.update!(
          processing_status:    "imported",
          haiku_category:       nil,
          haiku_confidence:     nil,
          haiku_reasoning:      nil,
          haiku_is_transfer:    nil,
          transaction_category: nil,
          manually_categorised: false
        )
        head :no_content
      end

      def reprocess_bulk
        ids = Array(params[:ids])
        Transaction.where(id: ids).update_all(
          processing_status:    "imported",
          haiku_category:       nil,
          haiku_confidence:     nil,
          haiku_reasoning:      nil,
          haiku_is_transfer:    nil,
          transaction_category_id: nil,
          manually_categorised: false
        )
        head :no_content
      end

      private

      def transaction
        @transaction ||= Transaction.find(params[:id])
      end

      def update_params
        params.require(:transaction).permit(:transaction_category_id, :manually_categorised)
      end
    end
  end
end

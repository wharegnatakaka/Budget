module Api
  module V1
    class MortgagesController < BaseController
      def index
        mortgages = Mortgage.includes(:pocketsmith_account).all
        render json: mortgages.map { |m| serialise(m) }
      end

      def show
        render json: serialise(mortgage)
      end

      def update
        if mortgage.update(mortgage_params)
          render json: serialise(mortgage)
        else
          render json: { errors: mortgage.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def mortgage
        @mortgage ||= Mortgage.includes(:pocketsmith_account).find(params[:id])
      end

      def mortgage_params
        params.require(:mortgage).permit(:label, :original_principal, :property_value)
      end

      def serialise(m)
        {
          id:                 m.id,
          label:              m.label,
          original_principal: m.original_principal,
          current_balance:    m.pocketsmith_account&.current_balance,
          balance_date:       m.pocketsmith_account&.current_balance_date,
        }
      end
    end
  end
end

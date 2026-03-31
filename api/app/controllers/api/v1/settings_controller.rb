module Api
  module V1
    class SettingsController < BaseController
      def index
        render json: Setting.all.map { |s| { key: s.key, value: s.value } }
      end

      def show
        value = Setting[params[:key]]
        render json: { key: params[:key], value: value }
      end

      def update
        Setting[params[:key]] = params.require(:setting).require(:value)
        render json: { key: params[:key], value: Setting[params[:key]] }
      end
    end
  end
end

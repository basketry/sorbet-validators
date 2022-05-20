# This code was generated by a tool.
# @basketry/sorbet-validators@{{version}}
#
# Changes to this file may cause incorrect behavior and will be lost if
# the code is regenerated.

# typed: strict

module BasketryExample::V1::Type
  module Validators
    extend T::Sig


    sig do
      abstract.params(
        search: T.nilable(String)
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_get_gizmos_parameters(**kwargs)
    end

    sig do
      abstract.params(
        size: T.nilable(BasketryExample::V1::Enums::CreateGizmoSize)
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_create_gizmo_parameters(**kwargs)
    end

    sig do
      abstract.params(
        factors: T.nilable(T::Array[String])
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_update_gizmo_parameters(**kwargs)
    end

    sig do
      abstract.params(
        body: T.nilable(BasketryExample::V1::Type::CreateWidgetBody)
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_create_widget_parameters(**kwargs)
    end

    sig do
      abstract.params(
        id: String
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_get_widget_foo_parameters(**kwargs)
    end

    sig do
      abstract.params(
        id: String
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_delete_widget_foo_parameters(**kwargs)
    end

    sig do
      abstract.params(
        query_string: T.nilable(String),
        query_enum: T.nilable(BasketryExample::V1::Enums::ExhaustiveParamsQueryEnum),
        query_number: T.nilable(Numeric),
        query_integer: T.nilable(Integer),
        query_boolean: T.nilable(T::Boolean),
        query_string_array: T.nilable(T::Array[String]),
        query_enum_array: T.nilable(T::Array[BasketryExample::V1::Enums::ExhaustiveParamsQueryEnumArray]),
        query_number_array: T.nilable(T::Array[Numeric]),
        query_integer_array: T.nilable(T::Array[Integer]),
        query_boolean_array: T.nilable(T::Array[T::Boolean]),
        path_string: String,
        path_enum: BasketryExample::V1::Enums::ExhaustiveParamsPathEnum,
        path_number: Numeric,
        path_integer: Integer,
        path_boolean: T::Boolean,
        path_string_array: T::Array[String],
        path_enum_array: T::Array[BasketryExample::V1::Enums::ExhaustiveParamsPathEnumArray],
        path_number_array: T::Array[Numeric],
        path_integer_array: T::Array[Integer],
        path_boolean_array: T::Array[T::Boolean],
        header_string: T.nilable(String),
        header_enum: T.nilable(BasketryExample::V1::Enums::ExhaustiveParamsHeaderEnum),
        header_number: T.nilable(Numeric),
        header_integer: T.nilable(Integer),
        header_boolean: T.nilable(T::Boolean),
        header_string_array: T.nilable(T::Array[String]),
        header_enum_array: T.nilable(T::Array[BasketryExample::V1::Enums::ExhaustiveParamsHeaderEnumArray]),
        header_number_array: T.nilable(T::Array[Numeric]),
        header_integer_array: T.nilable(T::Array[Integer]),
        header_boolean_array: T.nilable(T::Array[T::Boolean]),
        body: T.nilable(BasketryExample::V1::Type::ExhaustiveParamsBody)
      ).returns(
        T::Array[BasketryExample::V1::Type::ValidationError]
      )
    end
    def validate_exhaustive_params_parameters(**kwargs)
    end
  end
end

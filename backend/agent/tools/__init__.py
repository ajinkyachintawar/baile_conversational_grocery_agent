from .search_products import search_products
from .compare_stores import compare_stores
from .manage_cart import manage_cart
from .suggest_substitution import suggest_substitution
from .optimise_split import optimise_split
from .get_order_history import get_order_history

ALL_TOOLS = [
    search_products,
    compare_stores,
    manage_cart,
    suggest_substitution,
    optimise_split,
    get_order_history,
]

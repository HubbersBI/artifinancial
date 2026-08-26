"""Rejections raised by the portfolio layer.

Both carry a user-facing message: `str(exc)` is what the REST layer puts in the
400 `detail` and what the chat assistant reports back to the user.
"""


class TradeError(Exception):
    """A market order violated a PLAN section 8 trade execution rule."""


class WatchlistError(Exception):
    """A watchlist change was rejected.

    `status` is the HTTP status the REST layer should use: 400 for a malformed
    ticker, 409 for a duplicate, 404 for removing one that is not listed.
    """

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status

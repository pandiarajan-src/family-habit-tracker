from pydantic import BaseModel, ConfigDict, Field

from app.schemas.fields import Pin


class MemberCredentialUpdate(BaseModel):
    """Set a PIN. `current_pin` is required for your own PIN, not for a parent's reset (C14).

    Never logged or echoed [child-data-privacy #2].
    """

    model_config = ConfigDict(extra="forbid")

    pin: Pin
    current_pin: Pin | None = Field(default=None, description="Required to change your own PIN")

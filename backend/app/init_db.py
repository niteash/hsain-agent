from app.database import Base, engine
from app import models  # noqa: F401


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"Database initialized: {engine.url.database}")


if __name__ == "__main__":
    initialize_database()

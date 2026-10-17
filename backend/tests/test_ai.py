from app import ai
from conftest import live


@live
def test_two_plus_two():
    answer = ai.ask("What is 2+2? Reply with just the number.")
    assert "4" in answer

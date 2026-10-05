"""add content to repo_files

Revision ID: a1b2c3d4e5f6
Revises: f9cb0bed7838
Create Date: 2026-10-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f9cb0bed7838'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('repo_files', sa.Column('content', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('repo_files', 'content')

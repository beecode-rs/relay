import { fireEvent, render, screen } from '@testing-library/react-native';

import { HostKeyDialog } from '@/features/connect/host-key-dialog';

const fingerprint = 'SHA256:abc123deadbeef';

const noop = () => {
  return;
};

describe('HostKeyDialog', () => {
  it('shows the fingerprint and the unknown-host wording', async () => {
    await render(
      <HostKeyDialog fingerprint={fingerprint} onAccept={noop} onReject={noop} variant="host-key-unknown" />
    );
    expect(screen.getByText(fingerprint)).toBeTruthy();
    expect(screen.getByText('Unknown host key')).toBeTruthy();
    expect(screen.queryByText('Host key has changed')).toBeNull();
  });

  it('shows the stronger warning for a changed host key', async () => {
    await render(
      <HostKeyDialog fingerprint={fingerprint} onAccept={noop} onReject={noop} variant="host-key-changed" />
    );
    expect(screen.getByText('Host key has changed')).toBeTruthy();
    expect(screen.getByText(/man-in-the-middle/)).toBeTruthy();
  });

  it('calls accept and reject handlers from the buttons', async () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    await render(
      <HostKeyDialog fingerprint={fingerprint} onAccept={onAccept} onReject={onReject} variant="host-key-unknown" />
    );
    fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

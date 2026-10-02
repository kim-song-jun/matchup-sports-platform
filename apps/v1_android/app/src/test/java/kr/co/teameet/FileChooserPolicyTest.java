package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import java.util.List;
import org.junit.Test;

public final class FileChooserPolicyTest {
    @Test public void normalizesAndDeduplicatesMimeTypes() {
        assertEquals(
            List.of("image/jpeg", "image/png"),
            FileChooserPolicy.acceptedMimeTypes(
                new String[] {" image/JPEG, .png ", "IMAGE/JPEG"}
            )
        );
    }

    @Test public void fallsBackWhenThePageDoesNotDeclareAValidMimeType() {
        assertEquals(List.of("*/*"), FileChooserPolicy.acceptedMimeTypes(new String[] {""}));
        assertEquals(List.of("*/*"), FileChooserPolicy.acceptedMimeTypes(null));
    }

    @Test public void choosesTheNarrowestSystemPickerType() {
        assertEquals("image/jpeg", FileChooserPolicy.primaryMimeType(List.of("image/jpeg")));
        assertEquals(
            "image/*",
            FileChooserPolicy.primaryMimeType(List.of("image/jpeg", "image/png"))
        );
        assertEquals(
            "*/*",
            FileChooserPolicy.primaryMimeType(List.of("image/jpeg", "application/pdf"))
        );
    }
}